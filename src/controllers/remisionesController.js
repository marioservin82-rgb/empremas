import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import {
    emitirRemision as emitirRemisionConector,
    mapearRemisionAConector,
    resolverReceptor as resolverReceptorConector,
    consultarDocumento as consultarDocumentoConector,
    descargarKude as descargarKudeConector,
    ErrorConector,
} from '../services/conectorSifen.js';
import { resolverVehiculo, resolverChofer, resolverTransportista } from './flotaController.js';

// Deriva "EST-PUN-NNNNNNN" del CDC de SIFEN.
function numeroDesdeCdc(cdc) {
    if (!cdc || cdc.length < 24) return null;
    return `${cdc.slice(11, 14)}-${cdc.slice(14, 17)}-${cdc.slice(17, 24)}`;
}

async function empresaConector(cliente, empresaId) {
    const r = await cliente.query(
        `SELECT sifen_estado, sifen_conector_tenant_id, sifen_remision,
                razon_social, nombre_fantasia, ruc, direccion
         FROM empresas WHERE id = $1`,
        [empresaId]
    );
    const e = r.rows[0] || {};
    return {
        habilitada: !!e.sifen_remision,
        enProduccion: e.sifen_estado === 'produccion' && !!e.sifen_conector_tenant_id,
        tenantId: e.sifen_conector_tenant_id,
        // Datos del emisor para armar el "transportista" cuando el traslado es propio.
        emisor: {
            nombre: e.nombre_fantasia || e.razon_social || 'EMISOR',
            ruc: e.ruc || '',
            direccion: e.direccion || 'Sin dirección',
        },
    };
}

// Modo de transporte (interno EMPREMAS) -> iTipTrans / iRespFlete de SIFEN.
//   propio         : nuestro camión y chofer            -> tipo 1, resp 5
//   fletero        : transportista externo contratado   -> tipo 2, resp según quién paga (1/2/3)
//   cliente_retira : el cliente viene con su vehículo   -> tipo 2, resp 2 (receptor)
const RESP_FLETE_QUIEN_PAGA = { nosotros: 1, cliente: 2, tercero: 3 };

/**
 * Resuelve todos los datos de transporte de una remisión: elige o crea el
 * vehículo, el chofer y (si corresponde) el transportista, y arma la "foto"
 * JSONB que espera el conector. Lo nuevo que se carga queda guardado.
 *
 * body: { modoTransporte, vehiculoId|vehiculoNuevo, choferId|choferNuevo,
 *         transportistaId|transportistaNuevo, quienPagaFlete }
 */
async function resolverTransporte(cliente, empresaId, body, emisor, clienteRecord) {
    const modo = ['propio', 'fletero', 'cliente_retira'].includes(body.modoTransporte)
        ? body.modoTransporte
        : 'propio';

    const vehiculo = await resolverVehiculo(cliente, empresaId, body);
    const chofer = await resolverChofer(cliente, empresaId, body);

    let transportistaRow = null;
    let transportistaSnap;

    if (modo === 'fletero') {
        transportistaRow = await resolverTransportista(cliente, empresaId, body);
        transportistaSnap = transportistaRow.contribuyente
            ? { contribuyente: true, nombre: transportistaRow.nombre, ruc: transportistaRow.ruc, direccion: transportistaRow.direccion }
            : {
                  contribuyente: false,
                  nombre: transportistaRow.nombre,
                  documentoTipo: transportistaRow.documento_tipo || 1,
                  documentoNumero: transportistaRow.documento_numero,
                  direccion: transportistaRow.direccion,
              };
    } else if (modo === 'cliente_retira') {
        const doc = String(clienteRecord?.documento || '').trim();
        const nombre = clienteRecord?.nombre || 'CLIENTE';
        const dir = clienteRecord?.direccion || 'Sin dirección';
        transportistaSnap = doc.includes('-')
            ? { contribuyente: true, nombre, ruc: doc, direccion: dir }
            : { contribuyente: false, nombre, documentoTipo: 1, documentoNumero: doc.replace(/\D/g, '') || '0', direccion: dir };
    } else {
        // propio: el transportista es la propia empresa
        transportistaSnap = emisor.ruc.includes('-')
            ? { contribuyente: true, nombre: emisor.nombre, ruc: emisor.ruc, direccion: emisor.direccion }
            : { contribuyente: false, nombre: emisor.nombre, documentoTipo: 1, documentoNumero: emisor.ruc.replace(/\D/g, '') || '0', direccion: emisor.direccion };
    }

    const tipoTransporte = modo === 'propio' ? 1 : 2;
    const responsableFlete =
        modo === 'propio'
            ? 5
            : modo === 'cliente_retira'
              ? 2
              : RESP_FLETE_QUIEN_PAGA[body.quienPagaFlete] || 3;

    const transporte = {
        tipoTransporte,
        modalidad: 1,
        responsableFlete,
        vehiculo: { tipo: vehiculo.tipo, marca: vehiculo.marca, chapa: vehiculo.chapa },
        transportista: {
            ...transportistaSnap,
            chofer: {
                nombre: chofer.nombre,
                documentoNumero: chofer.documento_numero,
                direccion: chofer.direccion,
            },
        },
    };

    return {
        transporte,
        modo,
        tipoTransporte,
        responsableFlete,
        vehiculoId: vehiculo.id,
        choferId: chofer.id,
        transportistaId: transportistaRow?.id || null,
    };
}

// Corre la emisión contra el conector y guarda el resultado en la fila.
// Se llama FUERA de la transacción: un problema de SIFEN no debe perder la
// remisión ya registrada (queda 'error'/'pendiente' para reintentar).
async function emitirYActualizarRemision(empresaId, remisionId) {
    const datos = await consultaDeEmpresa(
        empresaId,
        `SELECT r.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento,
                c.es_generico AS cliente_es_generico, c.clasificacion_sifen AS cliente_clasificacion_sifen,
                e.sifen_conector_tenant_id
         FROM remisiones r
         JOIN empresas e ON e.id = r.empresa_id
         LEFT JOIN clientes c ON c.id = r.cliente_id
         WHERE r.id = $1`,
        [remisionId]
    );
    const r = datos.rows[0];
    if (!r) return;
    const tenantId = r.sifen_conector_tenant_id;

    const items = (
        await consultaDeEmpresa(
            empresaId,
            `SELECT ri.producto_id, ri.cantidad, p.nombre AS producto_nombre
             FROM remision_items ri JOIN productos p ON p.id = ri.producto_id
             WHERE ri.remision_id = $1`,
            [remisionId]
        )
    ).rows;

    try {
        const receptor = await resolverReceptorConector({
            cliente: {
                nombre: r.cliente_nombre,
                documento: r.cliente_documento,
                es_generico: r.cliente_es_generico,
                clasificacion_sifen: r.cliente_clasificacion_sifen,
            },
            tenantId,
        });
        const payload = mapearRemisionAConector({ remision: r, items, receptor });
        const resp = await emitirRemisionConector(tenantId, payload);
        const estado = (resp.estado || 'enviado').toLowerCase();
        const cdc = resp.cdc || null;
        const motivo =
            Array.isArray(resp.errores) && resp.errores.length && estado !== 'aprobado'
                ? resp.errores.join('; ')
                : null;

        await consultaDeEmpresa(
            empresaId,
            `UPDATE remisiones SET estado = $2, cdc = $3, numero_formateado = $4,
                    mensaje_error = $5, actualizado_en = now()
             WHERE id = $1`,
            [remisionId, motivo ? 'rechazado' : estado, cdc, numeroDesdeCdc(cdc), motivo]
        );
    } catch (error) {
        const mensaje = error instanceof ErrorConector ? error.message : 'No se pudo conectar con SIFEN';
        await consultaDeEmpresa(
            empresaId,
            `UPDATE remisiones SET estado = 'error', mensaje_error = $2, actualizado_en = now() WHERE id = $1`,
            [remisionId, mensaje]
        );
    }
}

// POST /api/remisiones — alta manual (cliente + ítems + entrega + transporte).
// body: { clienteId?, items:[{productoId,cantidad}], direccionEntrega, ciudadEntrega?,
//         direccionSalida?, ciudadSalida?, fechaInicioTraslado?, fechaFinTraslado?,
//         motivo?, observacion?, aFacturarDespues?, fechaFuturaFactura?,
//         modoTransporte, vehiculoId|vehiculoNuevo, choferId|choferNuevo,
//         transportistaId|transportistaNuevo, quienPagaFlete }
export async function crearRemision(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];

    if (items.length === 0) {
        return res.status(400).json({ error: 'La remisión necesita al menos un producto' });
    }
    if (!String(b.direccionEntrega || '').trim()) {
        return res.status(400).json({ error: 'Indicá la dirección de entrega' });
    }

    try {
        const remisionId = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const emp = await empresaConector(cliente, empresaId);
            if (!emp.habilitada) throw new ErrorNegocio('La Nota de Remisión no está habilitada para esta empresa');
            if (!emp.enProduccion) throw new ErrorNegocio('La facturación electrónica todavía no está en producción');

            let clienteIdFinal = b.clienteId || null;
            let clienteRecord = null;
            if (!clienteIdFinal) {
                const gen = await cliente.query(
                    `SELECT id, nombre, documento, direccion FROM clientes WHERE empresa_id = $1 AND es_generico = true LIMIT 1`,
                    [empresaId]
                );
                clienteRecord = gen.rows[0] || null;
                clienteIdFinal = clienteRecord?.id || null;
            } else {
                const c = await cliente.query(`SELECT id, nombre, documento, direccion FROM clientes WHERE id = $1`, [clienteIdFinal]);
                clienteRecord = c.rows[0] || null;
            }

            const tr = await resolverTransporte(cliente, empresaId, b, emp.emisor, clienteRecord);

            const itemsCalc = [];
            for (const it of items) {
                if (!(Number(it.cantidad) > 0)) throw new ErrorNegocio('Cada producto necesita una cantidad válida');
                const p = await cliente.query(`SELECT id FROM productos WHERE id = $1`, [it.productoId]);
                if (!p.rows[0]) throw new ErrorNegocio('Uno de los productos ya no existe');
                itemsCalc.push({ productoId: it.productoId, cantidad: Number(it.cantidad) });
            }

            const aFacturarDespues = b.aFacturarDespues !== false; // alta manual = "a facturar después" por defecto
            const descuentaStock = aFacturarDespues; // la mercadería sale del depósito ahora

            const ins = await cliente.query(
                `INSERT INTO remisiones
                    (empresa_id, sucursal_id, usuario_id, cliente_id, motivo, observacion,
                     direccion_entrega, ciudad_entrega, direccion_salida, ciudad_salida,
                     km_estimados, fecha_traslado, fecha_fin_traslado,
                     fecha_futura_factura, transporte, descuenta_stock,
                     modo_transporte, tipo_transporte, responsable_flete,
                     vehiculo_id, chofer_id, transportista_id, estado)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                         COALESCE($12, CURRENT_DATE), $13, $14, $15, $16,
                         $17,$18,$19,$20,$21,$22,'pendiente')
                 RETURNING id`,
                [
                    empresaId, sucursalId, usuarioId, clienteIdFinal,
                    Number(b.motivo) || 1, b.observacion || null,
                    String(b.direccionEntrega).trim(), b.ciudadEntrega ? Number(b.ciudadEntrega) : null,
                    b.direccionSalida ? String(b.direccionSalida).trim() : null,
                    b.ciudadSalida ? Number(b.ciudadSalida) : null,
                    Number(b.kmEstimados) || 1,
                    b.fechaInicioTraslado || b.fechaTraslado || null,
                    b.fechaFinTraslado || null,
                    aFacturarDespues ? (b.fechaFuturaFactura || new Date().toISOString().slice(0, 10)) : null,
                    JSON.stringify(tr.transporte), descuentaStock,
                    tr.modo, tr.tipoTransporte, tr.responsableFlete,
                    tr.vehiculoId, tr.choferId, tr.transportistaId,
                ]
            );
            const id = ins.rows[0].id;

            for (const it of itemsCalc) {
                await cliente.query(
                    `INSERT INTO remision_items (empresa_id, remision_id, producto_id, cantidad) VALUES ($1,$2,$3,$4)`,
                    [empresaId, id, it.productoId, it.cantidad]
                );
                if (descuentaStock) {
                    await cliente.query(
                        `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                        [it.productoId, sucursalId, it.cantidad]
                    );
                }
            }
            return id;
        });

        await emitirYActualizarRemision(empresaId, remisionId).catch((e) =>
            console.error('[remision] emisión falló', remisionId, e.message)
        );

        const final = await consultaDeEmpresa(empresaId, `SELECT * FROM remisiones WHERE id = $1`, [remisionId]);
        res.status(201).json(final.rows[0]);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

// POST /api/remisiones/desde-venta — genera la remisión de una factura ya emitida.
export async function crearRemisionDesdeVenta(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { ventaId } = req.body || {};
    const b = req.body || {};

    if (!ventaId) return res.status(400).json({ error: 'Falta la venta' });
    if (!String(b.direccionEntrega || '').trim()) {
        return res.status(400).json({ error: 'Indicá la dirección de entrega' });
    }

    try {
        const remisionId = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const emp = await empresaConector(cliente, empresaId);
            if (!emp.habilitada) throw new ErrorNegocio('La Nota de Remisión no está habilitada para esta empresa');
            if (!emp.enProduccion) throw new ErrorNegocio('La facturación electrónica todavía no está en producción');

            const v = await cliente.query(
                `SELECT v.cliente_id, de.estado AS de_estado, de.cdc AS de_cdc,
                        c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.direccion AS cliente_direccion
                 FROM ventas v
                 LEFT JOIN documentos_electronicos de ON de.venta_id = v.id
                 LEFT JOIN clientes c ON c.id = v.cliente_id
                 WHERE v.id = $1`,
                [ventaId]
            );
            const venta = v.rows[0];
            if (!venta) throw new ErrorNegocio('Venta no encontrada');
            if (!venta.de_cdc || venta.de_estado !== 'aprobado') {
                throw new ErrorNegocio('La factura de esta venta todavía no está aprobada por SIFEN');
            }

            const ya = await cliente.query(`SELECT id FROM remisiones WHERE venta_id = $1`, [ventaId]);
            if (ya.rows[0]) throw new ErrorNegocio('Esta venta ya tiene una remisión');

            const tr = await resolverTransporte(cliente, empresaId, b, emp.emisor, {
                nombre: venta.cliente_nombre,
                documento: venta.cliente_documento,
                direccion: venta.cliente_direccion,
            });

            const items = (
                await cliente.query(`SELECT producto_id, cantidad FROM venta_items WHERE venta_id = $1`, [ventaId])
            ).rows;

            const ins = await cliente.query(
                `INSERT INTO remisiones
                    (empresa_id, sucursal_id, usuario_id, cliente_id, venta_id, factura_cdc, facturada,
                     motivo, observacion, direccion_entrega, ciudad_entrega, direccion_salida, ciudad_salida,
                     km_estimados, fecha_traslado, fecha_fin_traslado, transporte, descuenta_stock,
                     modo_transporte, tipo_transporte, responsable_flete,
                     vehiculo_id, chofer_id, transportista_id, estado)
                 VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,$12,$13,
                         COALESCE($14,CURRENT_DATE), $15, $16, false,
                         $17,$18,$19,$20,$21,$22,'pendiente')
                 RETURNING id`,
                [
                    empresaId, sucursalId, usuarioId, venta.cliente_id, ventaId, venta.de_cdc,
                    Number(b.motivo) || 1, b.observacion || null,
                    String(b.direccionEntrega).trim(), b.ciudadEntrega ? Number(b.ciudadEntrega) : null,
                    b.direccionSalida ? String(b.direccionSalida).trim() : null,
                    b.ciudadSalida ? Number(b.ciudadSalida) : null,
                    Number(b.kmEstimados) || 1,
                    b.fechaInicioTraslado || b.fechaTraslado || null,
                    b.fechaFinTraslado || null,
                    JSON.stringify(tr.transporte),
                    tr.modo, tr.tipoTransporte, tr.responsableFlete,
                    tr.vehiculoId, tr.choferId, tr.transportistaId,
                ]
            );
            const id = ins.rows[0].id;
            for (const it of items) {
                await cliente.query(
                    `INSERT INTO remision_items (empresa_id, remision_id, producto_id, cantidad) VALUES ($1,$2,$3,$4)`,
                    [empresaId, id, it.producto_id, it.cantidad]
                );
            }
            return id;
        });

        await emitirYActualizarRemision(empresaId, remisionId).catch((e) =>
            console.error('[remision] emisión falló', remisionId, e.message)
        );

        const final = await consultaDeEmpresa(empresaId, `SELECT * FROM remisiones WHERE id = $1`, [remisionId]);
        res.status(201).json(final.rows[0]);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

export async function listarRemisiones(req, res) {
    const { empresaId } = req.usuario;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT r.id, r.estado, r.cdc, r.numero_formateado, r.mensaje_error, r.creado_en,
                r.facturada, r.factura_cdc, r.fecha_futura_factura, r.venta_id,
                c.nombre AS cliente_nombre
         FROM remisiones r
         LEFT JOIN clientes c ON c.id = r.cliente_id
         ORDER BY r.creado_en DESC LIMIT 200`,
        []
    );
    res.json(r.rows);
}

export async function obtenerRemision(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT r.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento, u.nombre AS usuario_nombre,
                veh.tipo AS vehiculo_tipo, veh.marca AS vehiculo_marca, veh.chapa AS vehiculo_chapa,
                ch.nombre AS chofer_nombre, ch.documento_numero AS chofer_documento,
                tra.nombre AS transportista_nombre
         FROM remisiones r
         LEFT JOIN clientes c ON c.id = r.cliente_id
         LEFT JOIN usuarios u ON u.id = r.usuario_id
         LEFT JOIN remision_vehiculos veh ON veh.id = r.vehiculo_id
         LEFT JOIN remision_choferes ch ON ch.id = r.chofer_id
         LEFT JOIN remision_transportistas tra ON tra.id = r.transportista_id
         WHERE r.id = $1`,
        [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Remisión no encontrada' });
    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT ri.*, p.nombre AS producto_nombre, p.unidad_medida
         FROM remision_items ri JOIN productos p ON p.id = ri.producto_id
         WHERE ri.remision_id = $1`,
        [id]
    );
    res.json({ ...r.rows[0], items: items.rows });
}

export async function reintentarRemision(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const actual = await consultaDeEmpresa(empresaId, `SELECT estado, cdc FROM remisiones WHERE id = $1`, [id]);
    const rem = actual.rows[0];
    if (!rem) return res.status(404).json({ error: 'Remisión no encontrada' });

    try {
        if (rem.cdc && ['enviado', 'pendiente'].includes(rem.estado)) {
            // En trámite por lote: se re-consulta, no se re-emite.
            const r = await consultarDocumentoConector(rem.cdc);
            const nuevoEstado = (r.estado || 'enviado').toLowerCase();
            const motivo = Array.isArray(r.errores) && r.errores.length ? r.errores.join('; ') : null;
            await consultaDeEmpresa(
                empresaId,
                `UPDATE remisiones SET estado = $2, mensaje_error = $3, actualizado_en = now() WHERE id = $1`,
                [id, nuevoEstado, nuevoEstado === 'rechazado' ? motivo : null]
            );
        } else if (['error', 'pendiente', 'rechazado'].includes(rem.estado)) {
            await emitirYActualizarRemision(empresaId, id);
        }
    } catch (error) {
        return res.status(422).json({ error: error.message });
    }

    const final = await consultaDeEmpresa(empresaId, `SELECT * FROM remisiones WHERE id = $1`, [id]);
    res.json(final.rows[0]);
}

export async function descargarKudeRemision(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const r = await consultaDeEmpresa(empresaId, `SELECT estado, cdc FROM remisiones WHERE id = $1`, [id]);
    const rem = r.rows[0];
    if (!rem || !rem.cdc) return res.status(404).json({ error: 'La remisión todavía no tiene CDC' });
    if (rem.estado !== 'aprobado') return res.status(400).json({ error: 'La remisión todavía no fue aprobada' });
    const pdf = await descargarKudeConector(rem.cdc);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
}
