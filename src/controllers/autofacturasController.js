import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import {
    emitirAutofactura as emitirAutofacturaConector,
    mapearAutofacturaAConector,
    buscarCiudades as buscarCiudadesConector,
    consultarDocumento as consultarDocumentoConector,
    descargarKude as descargarKudeConector,
    ErrorConector,
} from '../services/conectorSifen.js';

function numeroDesdeCdc(cdc) {
    if (!cdc || cdc.length < 24) return null;
    return `${cdc.slice(11, 14)}-${cdc.slice(14, 17)}-${cdc.slice(17, 24)}`;
}

async function empresaConector(cliente, empresaId) {
    const r = await cliente.query(
        `SELECT sifen_estado, sifen_conector_tenant_id, sifen_autofactura FROM empresas WHERE id = $1`,
        [empresaId]
    );
    const e = r.rows[0] || {};
    return {
        habilitada: !!e.sifen_autofactura,
        enProduccion: e.sifen_estado === 'produccion' && !!e.sifen_conector_tenant_id,
        tenantId: e.sifen_conector_tenant_id,
    };
}

// Corre la emisión contra el conector y guarda el resultado. Fuera de la
// transacción: un problema de SIFEN no debe perder la autofactura registrada.
async function emitirYActualizarAutofactura(empresaId, autofacturaId) {
    const datos = await consultaDeEmpresa(
        empresaId,
        `SELECT a.*, e.sifen_conector_tenant_id
         FROM autofacturas a JOIN empresas e ON e.id = a.empresa_id
         WHERE a.id = $1`,
        [autofacturaId]
    );
    const af = datos.rows[0];
    if (!af) return;
    const tenantId = af.sifen_conector_tenant_id;

    const items = (
        await consultaDeEmpresa(
            empresaId,
            `SELECT descripcion, cantidad, precio_unitario FROM autofactura_items WHERE autofactura_id = $1`,
            [autofacturaId]
        )
    ).rows;

    try {
        const payload = mapearAutofacturaAConector({ af, items });
        const resp = await emitirAutofacturaConector(tenantId, payload);
        const estado = (resp.estado || 'enviado').toLowerCase();
        const cdc = resp.cdc || null;
        const motivo =
            Array.isArray(resp.errores) && resp.errores.length && estado !== 'aprobado'
                ? resp.errores.join('; ')
                : null;

        await consultaDeEmpresa(
            empresaId,
            `UPDATE autofacturas SET estado = $2, cdc = $3, numero_formateado = $4,
                    mensaje_error = $5, actualizado_en = now()
             WHERE id = $1`,
            [autofacturaId, motivo ? 'rechazado' : estado, cdc, numeroDesdeCdc(cdc), motivo]
        );
    } catch (error) {
        const mensaje = error instanceof ErrorConector ? error.message : 'No se pudo conectar con SIFEN';
        await consultaDeEmpresa(
            empresaId,
            `UPDATE autofacturas SET estado = 'error', mensaje_error = $2, actualizado_en = now() WHERE id = $1`,
            [autofacturaId, mensaje]
        );
    }
}

// GET /api/autofacturas/ciudades?q=texto — buscador geográfico de SIFEN.
export async function buscarCiudades(req, res) {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ ciudades: [] });
    try {
        const r = await buscarCiudadesConector(q);
        res.json({ ciudades: r.ciudades || [] });
    } catch (error) {
        res.status(502).json({ error: error.message, ciudades: [] });
    }
}

// POST /api/autofacturas
// body: { proveedorId?, vendedor:{naturaleza,docTipo,docNumero,nombre,direccion,numeroCasa?,ciudad},
//         transaccion:{direccion,ciudad}, constancia:{tipo,numero,control},
//         tipoTransaccion?, observacion?, items:[{descripcion,cantidad,precioUnitario}] }
export async function crearAutofactura(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const b = req.body || {};
    const v = b.vendedor || {};
    const t = b.transaccion || {};
    const c = b.constancia || {};
    const items = Array.isArray(b.items) ? b.items : [];

    if (!v.nombre || !v.docNumero || !v.direccion || !Number(v.ciudad)) {
        return res.status(400).json({ error: 'Faltan datos del vendedor (nombre, documento, dirección, ciudad)' });
    }
    if (!t.direccion || !Number(t.ciudad)) {
        return res.status(400).json({ error: 'Indicá dónde se hizo la compra (dirección y ciudad)' });
    }
    if (!String(c.numero || '').trim() || !String(c.control || '').trim()) {
        return res.status(400).json({ error: 'Falta la Constancia de No Ser Contribuyente (número y código de control)' });
    }
    if (items.length === 0) return res.status(400).json({ error: 'La autofactura necesita al menos un ítem' });
    for (const it of items) {
        if (!String(it.descripcion || '').trim()) return res.status(400).json({ error: 'Cada ítem necesita una descripción' });
        if (!(Number(it.cantidad) > 0)) return res.status(400).json({ error: 'Cada ítem necesita una cantidad válida' });
        if (!(Number(it.precioUnitario) > 0)) return res.status(400).json({ error: 'Cada ítem necesita un precio válido' });
    }

    try {
        const autofacturaId = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const emp = await empresaConector(cliente, empresaId);
            if (!emp.habilitada) throw new ErrorNegocio('La Autofactura no está habilitada para esta empresa');
            if (!emp.enProduccion) throw new ErrorNegocio('La facturación electrónica todavía no está en producción');

            const total = items.reduce((a, it) => a + Number(it.precioUnitario) * Number(it.cantidad), 0);

            const ins = await cliente.query(
                `INSERT INTO autofacturas
                    (empresa_id, sucursal_id, usuario_id, proveedor_id,
                     vendedor_naturaleza, vendedor_doc_tipo, vendedor_doc_numero, vendedor_nombre,
                     vendedor_direccion, vendedor_numero_casa, vendedor_ciudad,
                     transaccion_direccion, transaccion_ciudad,
                     constancia_tipo, constancia_numero, constancia_control,
                     tipo_transaccion, observacion, total, estado)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pendiente')
                 RETURNING id`,
                [
                    empresaId, sucursalId, usuarioId, b.proveedorId || null,
                    Number(v.naturaleza) || 1, Number(v.docTipo) || 1, String(v.docNumero).trim(),
                    String(v.nombre).trim(), String(v.direccion).trim(), String(v.numeroCasa || '0').trim(),
                    Number(v.ciudad),
                    String(t.direccion).trim(), Number(t.ciudad),
                    Number(c.tipo) || 1, String(c.numero).trim(), String(c.control).trim(),
                    Number(b.tipoTransaccion) || 10, b.observacion || null, total,
                ]
            );
            const id = ins.rows[0].id;

            for (const it of items) {
                await cliente.query(
                    `INSERT INTO autofactura_items (empresa_id, autofactura_id, descripcion, cantidad, precio_unitario, subtotal)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
                    [
                        empresaId, id, String(it.descripcion).trim(),
                        Number(it.cantidad), Number(it.precioUnitario),
                        Number(it.precioUnitario) * Number(it.cantidad),
                    ]
                );
            }
            return id;
        });

        await emitirYActualizarAutofactura(empresaId, autofacturaId).catch((e) =>
            console.error('[autofactura] emisión falló', autofacturaId, e.message)
        );

        const final = await consultaDeEmpresa(empresaId, `SELECT * FROM autofacturas WHERE id = $1`, [autofacturaId]);
        res.status(201).json(final.rows[0]);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

export async function listarAutofacturas(req, res) {
    const { empresaId } = req.usuario;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT id, estado, cdc, numero_formateado, mensaje_error, total,
                vendedor_nombre, creado_en
         FROM autofacturas ORDER BY creado_en DESC LIMIT 200`,
        []
    );
    res.json(r.rows);
}

export async function obtenerAutofactura(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT a.*, u.nombre AS usuario_nombre, p.nombre AS proveedor_nombre
         FROM autofacturas a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN proveedores p ON p.id = a.proveedor_id
         WHERE a.id = $1`,
        [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Autofactura no encontrada' });
    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM autofactura_items WHERE autofactura_id = $1`,
        [id]
    );
    res.json({ ...r.rows[0], items: items.rows });
}

export async function reintentarAutofactura(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const actual = await consultaDeEmpresa(empresaId, `SELECT estado, cdc FROM autofacturas WHERE id = $1`, [id]);
    const af = actual.rows[0];
    if (!af) return res.status(404).json({ error: 'Autofactura no encontrada' });

    try {
        if (af.cdc && ['enviado', 'pendiente'].includes(af.estado)) {
            const r = await consultarDocumentoConector(af.cdc);
            const nuevoEstado = (r.estado || 'enviado').toLowerCase();
            const motivo = Array.isArray(r.errores) && r.errores.length ? r.errores.join('; ') : null;
            await consultaDeEmpresa(
                empresaId,
                `UPDATE autofacturas SET estado = $2, mensaje_error = $3, actualizado_en = now() WHERE id = $1`,
                [id, nuevoEstado, nuevoEstado === 'rechazado' ? motivo : null]
            );
        } else if (['error', 'pendiente', 'rechazado'].includes(af.estado)) {
            await emitirYActualizarAutofactura(empresaId, id);
        }
    } catch (error) {
        return res.status(422).json({ error: error.message });
    }

    const final = await consultaDeEmpresa(empresaId, `SELECT * FROM autofacturas WHERE id = $1`, [id]);
    res.json(final.rows[0]);
}

export async function descargarKudeAutofactura(req, res) {
    const { empresaId } = req.usuario;
    const r = await consultaDeEmpresa(empresaId, `SELECT estado, cdc FROM autofacturas WHERE id = $1`, [req.params.id]);
    const af = r.rows[0];
    if (!af || !af.cdc) return res.status(404).json({ error: 'La autofactura todavía no tiene CDC' });
    if (af.estado !== 'aprobado') return res.status(400).json({ error: 'La autofactura todavía no fue aprobada' });
    const pdf = await descargarKudeConector(af.cdc);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
}
