import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import {
    emitirNota as emitirNotaConector,
    resolverReceptor as resolverReceptorConector,
    consultarDocumento as consultarDocumentoConector,
    descargarKude as descargarKudeConector,
    ErrorConector,
} from '../services/conectorSifen.js';

function numeroDesdeCdc(cdc) {
    if (!cdc || cdc.length < 24) return null;
    return `${cdc.slice(11, 14)}-${cdc.slice(14, 17)}-${cdc.slice(17, 24)}`;
}

// NC por Devolución (1) o Devolución y ajuste de precios (2 en la tabla de
// SIFEN es "Devolución") -> el stock vuelve a entrar.
const MOTIVOS_REINGRESAN_STOCK = new Set([1, 2]);

async function emitirYActualizarNota(empresaId, notaId) {
    const datos = await consultaDeEmpresa(
        empresaId,
        `SELECT n.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento,
                c.es_generico AS cliente_es_generico, c.clasificacion_sifen AS cliente_clasificacion_sifen,
                e.sifen_conector_tenant_id
         FROM notas_electronicas n
         JOIN empresas e ON e.id = n.empresa_id
         JOIN ventas v ON v.id = n.venta_id
         LEFT JOIN clientes c ON c.id = v.cliente_id
         WHERE n.id = $1`,
        [notaId]
    );
    const n = datos.rows[0];
    if (!n) return;
    const tenantId = n.sifen_conector_tenant_id;

    const items = (
        await consultaDeEmpresa(
            empresaId,
            `SELECT ni.producto_id, ni.cantidad, ni.precio_unitario, ni.tasa_iva, p.nombre AS producto_nombre
             FROM nota_items ni JOIN productos p ON p.id = ni.producto_id WHERE ni.nota_id = $1`,
            [notaId]
        )
    ).rows;

    try {
        const receptor = await resolverReceptorConector({
            cliente: {
                nombre: n.cliente_nombre,
                documento: n.cliente_documento,
                es_generico: n.cliente_es_generico,
                clasificacion_sifen: n.cliente_clasificacion_sifen,
            },
            tenantId,
        });
        const payload = {
            motivo: Number(n.motivo),
            cdcFacturaAsociada: n.factura_cdc,
            observacion: n.observacion || undefined,
            items: items.map((it, i) => ({
                codigo: String(it.producto_id).slice(0, 8) || i + 1,
                descripcion: it.producto_nombre || 'Producto',
                cantidad: Number(it.cantidad),
                unidadMedida: 77,
                precioUnitario: Math.round(Number(it.precio_unitario)),
                ivaTasa: [0, 5, 10].includes(Number(it.tasa_iva)) ? Number(it.tasa_iva) : 10,
            })),
        };
        const resp = await emitirNotaConector(tenantId, n.tipo, payload, receptor);
        const estado = (resp.estado || 'enviado').toLowerCase();
        const cdc = resp.cdc || null;
        const t = resp.totales || null;
        const motivo =
            Array.isArray(resp.errores) && resp.errores.length && estado !== 'aprobado'
                ? resp.errores.join('; ')
                : null;

        await consultaDeEmpresa(
            empresaId,
            `UPDATE notas_electronicas SET estado = $2, cdc = $3, numero_formateado = $4, mensaje_error = $5,
                    gravado_5 = $6, gravado_10 = $7, exentas = $8, iva_5 = $9, iva_10 = $10, total_iva = $11,
                    actualizado_en = now()
             WHERE id = $1`,
            [
                notaId, motivo ? 'rechazado' : estado, cdc, numeroDesdeCdc(cdc), motivo,
                t?.gravado5 ?? null, t?.gravado10 ?? null, t?.exentas ?? null,
                t?.iva5 ?? null, t?.iva10 ?? null, t?.totalIva ?? null,
            ]
        );
    } catch (error) {
        const mensaje = error instanceof ErrorConector ? error.message : 'No se pudo conectar con SIFEN';
        await consultaDeEmpresa(
            empresaId,
            `UPDATE notas_electronicas SET estado = 'error', mensaje_error = $2, actualizado_en = now() WHERE id = $1`,
            [notaId, mensaje]
        );
    }
}

// POST /api/notas — crea y emite una NC/ND sobre una factura aprobada.
// body: { tipo:'credito'|'debito', ventaId, motivo, observacion?,
//         esTotal?:bool, items?:[{ productoId, cantidad }] }
export async function crearNota(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const b = req.body || {};
    const tipo = b.tipo === 'debito' ? 'debito' : 'credito';
    const motivo = Number(b.motivo);

    if (![1, 2, 3, 4, 5, 6, 7, 8].includes(motivo)) {
        return res.status(400).json({ error: 'Motivo inválido' });
    }
    if (!b.ventaId) return res.status(400).json({ error: 'Falta la factura' });

    try {
        const notaId = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const emp = await cliente.query(
                `SELECT sifen_estado, sifen_conector_tenant_id, sifen_nc_nd FROM empresas WHERE id = $1`,
                [empresaId]
            );
            const e = emp.rows[0] || {};
            if (!e.sifen_nc_nd) throw new ErrorNegocio('Las Notas de Crédito/Débito no están habilitadas para esta empresa');
            if (e.sifen_estado !== 'produccion' || !e.sifen_conector_tenant_id) {
                throw new ErrorNegocio('La facturación electrónica todavía no está en producción');
            }

            const v = await cliente.query(
                `SELECT v.id, v.total, v.tipo_pago, v.cliente_id, v.anulada, v.tipo_comprobante,
                        de.estado AS de_estado, de.cdc AS de_cdc
                 FROM ventas v
                 LEFT JOIN documentos_electronicos de ON de.venta_id = v.id
                 WHERE v.id = $1`,
                [b.ventaId]
            );
            const venta = v.rows[0];
            if (!venta) throw new ErrorNegocio('Factura no encontrada');
            if (venta.tipo_comprobante !== 'factura_legal') throw new ErrorNegocio('Esa venta no es una Factura Legal');
            if (venta.de_estado !== 'aprobado' || !venta.de_cdc) {
                throw new ErrorNegocio('La factura todavía no está aprobada por SIFEN');
            }

            const ventaItems = (
                await cliente.query(
                    `SELECT vi.producto_id, vi.cantidad, vi.precio_unitario, p.tasa_iva
                     FROM venta_items vi JOIN productos p ON p.id = vi.producto_id
                     WHERE vi.venta_id = $1`,
                    [b.ventaId]
                )
            ).rows;

            // Ítems de la nota: toda la factura, o los seleccionados (cant <= vendida).
            let items;
            if (b.esTotal || !Array.isArray(b.items) || b.items.length === 0) {
                items = ventaItems.map((vi) => ({
                    productoId: vi.producto_id,
                    cantidad: Number(vi.cantidad),
                    precioUnitario: Number(vi.precio_unitario),
                    tasaIva: Number(vi.tasa_iva),
                }));
            } else {
                items = [];
                for (const sel of b.items) {
                    const vi = ventaItems.find((x) => x.producto_id === sel.productoId);
                    if (!vi) throw new ErrorNegocio('Un producto seleccionado no está en la factura');
                    const cant = Number(sel.cantidad);
                    if (!(cant > 0) || cant > Number(vi.cantidad) + 1e-6) {
                        throw new ErrorNegocio('La cantidad a acreditar no puede superar la vendida');
                    }
                    items.push({
                        productoId: vi.producto_id,
                        cantidad: cant,
                        precioUnitario: Number(vi.precio_unitario),
                        tasaIva: Number(vi.tasa_iva),
                    });
                }
            }
            if (items.length === 0) throw new ErrorNegocio('La nota necesita al menos un ítem');

            const total = items.reduce((a, it) => a + it.precioUnitario * it.cantidad, 0);
            const esTotalReal = Math.round(total) >= Math.round(Number(venta.total)) - 1;
            // Si la venta YA fue anulada (el cajero la anuló antes), el stock y el
            // saldo del cliente ya se revirtieron ahí — la NC es sólo el documento
            // fiscal, no vuelve a tocar stock ni saldo (si no, doble reingreso).
            const yaAnulada = !!venta.anulada;
            const reingresaStock = !yaAnulada && tipo === 'credito' && MOTIVOS_REINGRESAN_STOCK.has(motivo);

            const ins = await cliente.query(
                `INSERT INTO notas_electronicas
                    (empresa_id, sucursal_id, usuario_id, tipo, venta_id, factura_cdc, motivo, observacion,
                     total, es_total, reingresa_stock, estado)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendiente')
                 RETURNING id`,
                [
                    empresaId, sucursalId, usuarioId, tipo, venta.id, venta.de_cdc, motivo,
                    b.observacion || null, total, esTotalReal, reingresaStock,
                ]
            );
            const id = ins.rows[0].id;

            for (const it of items) {
                await cliente.query(
                    `INSERT INTO nota_items (empresa_id, nota_id, producto_id, cantidad, precio_unitario, tasa_iva, subtotal)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [empresaId, id, it.productoId, it.cantidad, it.precioUnitario, it.tasaIva, it.precioUnitario * it.cantidad]
                );
                if (reingresaStock) {
                    await cliente.query(
                        `UPDATE producto_stock SET stock = stock + $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                        [it.productoId, sucursalId, it.cantidad]
                    );
                }
            }

            // Efecto en el saldo del cliente si la factura era a crédito (y no
            // estaba ya anulada, en cuyo caso el saldo ya se revirtió).
            if (!yaAnulada && venta.tipo_pago === 'credito' && venta.cliente_id) {
                const delta = tipo === 'credito' ? -total : total;
                await cliente.query(`UPDATE clientes SET saldo = saldo + $2 WHERE id = $1`, [venta.cliente_id, delta]);
            }

            // NC total sobre una factura no anulada = anulación fiscal: se marca la venta.
            if (tipo === 'credito' && esTotalReal && !venta.anulada) {
                await cliente.query(
                    `UPDATE ventas SET anulada = true, anulada_por = $2, anulada_en = now(),
                            motivo_anulacion = 'Nota de Crédito electrónica'
                     WHERE id = $1`,
                    [venta.id, usuarioId]
                );
            }
            return id;
        });

        await emitirYActualizarNota(empresaId, notaId).catch((err) =>
            console.error('[nota] emisión falló', notaId, err.message)
        );

        const final = await consultaDeEmpresa(empresaId, `SELECT * FROM notas_electronicas WHERE id = $1`, [notaId]);
        res.status(201).json(final.rows[0]);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

export async function listarNotas(req, res) {
    const { empresaId } = req.usuario;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT n.id, n.tipo, n.estado, n.cdc, n.numero_formateado, n.mensaje_error, n.total,
                n.motivo, n.creado_en, n.venta_id, c.nombre AS cliente_nombre
         FROM notas_electronicas n
         JOIN ventas v ON v.id = n.venta_id
         LEFT JOIN clientes c ON c.id = v.cliente_id
         ORDER BY n.creado_en DESC LIMIT 200`,
        []
    );
    res.json(r.rows);
}

export async function obtenerNota(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT n.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento, u.nombre AS usuario_nombre,
                v.numero_ticket
         FROM notas_electronicas n
         JOIN ventas v ON v.id = n.venta_id
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = n.usuario_id
         WHERE n.id = $1`,
        [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Nota no encontrada' });
    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT ni.*, p.nombre AS producto_nombre FROM nota_items ni
         JOIN productos p ON p.id = ni.producto_id WHERE ni.nota_id = $1`,
        [id]
    );
    res.json({ ...r.rows[0], items: items.rows });
}

// Notas de una venta puntual (para el detalle de la factura).
export async function notasDeVenta(req, res) {
    const { empresaId } = req.usuario;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT id, tipo, estado, numero_formateado, total, motivo, creado_en
         FROM notas_electronicas WHERE venta_id = $1 ORDER BY creado_en`,
        [req.params.ventaId]
    );
    res.json(r.rows);
}

export async function reintentarNota(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const actual = await consultaDeEmpresa(empresaId, `SELECT estado, cdc FROM notas_electronicas WHERE id = $1`, [id]);
    const nota = actual.rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota no encontrada' });

    try {
        if (nota.cdc && ['enviado', 'pendiente'].includes(nota.estado)) {
            const r = await consultarDocumentoConector(nota.cdc);
            const nuevoEstado = (r.estado || 'enviado').toLowerCase();
            const motivo = Array.isArray(r.errores) && r.errores.length ? r.errores.join('; ') : null;
            await consultaDeEmpresa(
                empresaId,
                `UPDATE notas_electronicas SET estado = $2, mensaje_error = $3, actualizado_en = now() WHERE id = $1`,
                [id, nuevoEstado, nuevoEstado === 'rechazado' ? motivo : null]
            );
        } else if (['error', 'pendiente', 'rechazado'].includes(nota.estado)) {
            await emitirYActualizarNota(empresaId, id);
        }
    } catch (error) {
        return res.status(422).json({ error: error.message });
    }

    const final = await consultaDeEmpresa(empresaId, `SELECT * FROM notas_electronicas WHERE id = $1`, [id]);
    res.json(final.rows[0]);
}

export async function descargarKudeNota(req, res) {
    const { empresaId } = req.usuario;
    const r = await consultaDeEmpresa(empresaId, `SELECT estado, cdc FROM notas_electronicas WHERE id = $1`, [req.params.id]);
    const nota = r.rows[0];
    if (!nota || !nota.cdc) return res.status(404).json({ error: 'La nota todavía no tiene CDC' });
    if (nota.estado !== 'aprobado') return res.status(400).json({ error: 'La nota todavía no fue aprobada' });
    const pdf = await descargarKudeConector(nota.cdc);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
}
