import pool, { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { SQL_HOY_PY, estadoDeMembresia } from '../utils/membresias.js';

// Membresias de salones/barberias (modulo por empresa: empresas.membresias_habilitadas).
// Las tablas tienen RLS: siempre consultaDeEmpresa / transaccionDeEmpresa.

async function moduloHabilitado(empresaId) {
    const r = await pool.query(`SELECT membresias_habilitadas FROM empresas WHERE id = $1`, [empresaId]);
    return !!r.rows[0]?.membresias_habilitadas;
}

// Corta la request con 403 si el modulo esta apagado. Devuelve true si corto.
async function sinModulo(req, res) {
    if (await moduloHabilitado(req.usuario.empresaId)) return false;
    res.status(403).json({ error: 'Las membresías no están habilitadas para tu empresa' });
    return true;
}

function aPlan(f) {
    return {
        id: f.id,
        nombre: f.nombre,
        descripcion: f.descripcion,
        precioMensual: Number(f.precio_mensual),
        descuentoServiciosPct: Number(f.descuento_servicios_pct),
        diasGracia: Number(f.dias_gracia),
        productoId: f.producto_id,
        tasaIva: f.tasa_iva === undefined ? undefined : Number(f.tasa_iva),
        activo: f.activo,
        membresiasVigentes: f.membresias_vigentes === undefined ? undefined : Number(f.membresias_vigentes),
    };
}

// ---------------------------------------------------------------- planes

// GET /api/membresias/planes  (dueno/encargado)
export async function listarPlanes(req, res) {
    if (await sinModulo(req, res)) return;
    const { empresaId } = req.usuario;
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT mp.*, p.tasa_iva,
                (SELECT count(*) FROM membresias m WHERE m.plan_id = mp.id AND m.cancelada = false) AS membresias_vigentes
           FROM membresia_planes mp JOIN productos p ON p.id = mp.producto_id
          ORDER BY mp.activo DESC, mp.nombre`,
        []
    );
    res.json({ planes: r.rows.map(aPlan) });
}

function limpiarPlan(body, { parcial }) {
    const out = {};
    if (body.nombre !== undefined || !parcial) {
        const nombre = String(body.nombre ?? '').trim();
        if (!nombre) return { error: 'Poné un nombre para el plan (ej.: Oro)' };
        out.nombre = nombre.slice(0, 60);
    }
    if (body.precioMensual !== undefined || !parcial) {
        const precio = Number(body.precioMensual);
        if (!Number.isInteger(precio) || precio <= 0) return { error: 'El precio mensual debe ser un número entero mayor a 0' };
        out.precioMensual = precio;
    }
    if (body.descuentoServiciosPct !== undefined) {
        const d = Number(body.descuentoServiciosPct);
        if (!(d >= 0 && d <= 100)) return { error: 'El descuento debe estar entre 0 y 100' };
        out.descuentoServiciosPct = d;
    }
    if (body.diasGracia !== undefined) {
        const g = Number(body.diasGracia);
        if (!Number.isInteger(g) || g < 0 || g > 60) return { error: 'Los días de gracia deben ser un número entero entre 0 y 60' };
        out.diasGracia = g;
    }
    if (body.tasaIva !== undefined) {
        if (![0, 5, 10].includes(Number(body.tasaIva))) return { error: 'La tasa de IVA debe ser 0, 5 o 10' };
        out.tasaIva = Number(body.tasaIva);
    }
    if (body.descripcion !== undefined) out.descripcion = String(body.descripcion ?? '').trim().slice(0, 300) || null;
    return { datos: out };
}

// POST /api/membresias/planes  (dueno). Crea tambien el servicio que se vende
// para cobrar la cuota ("Cuota Membresia Oro").
export async function crearPlan(req, res) {
    if (await sinModulo(req, res)) return;
    const { empresaId } = req.usuario;
    const { datos, error } = limpiarPlan(req.body, { parcial: false });
    if (error) return res.status(400).json({ error });

    const id = await transaccionDeEmpresa(empresaId, async (cliente) => {
        const producto = await cliente.query(
            `INSERT INTO productos (empresa_id, nombre, unidad_medida, precio_contado, precio_credito, precio_mayorista, tasa_iva, es_servicio)
             VALUES ($1, $2, 'unidad', $3, $3, $3, $4, true) RETURNING id`,
            [empresaId, `Cuota Membresía ${datos.nombre}`, datos.precioMensual, datos.tasaIva ?? 10]
        );
        const plan = await cliente.query(
            `INSERT INTO membresia_planes (empresa_id, nombre, descripcion, precio_mensual, descuento_servicios_pct, dias_gracia, producto_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [empresaId, datos.nombre, datos.descripcion ?? null, datos.precioMensual, datos.descuentoServiciosPct ?? 0, datos.diasGracia ?? 5, producto.rows[0].id]
        );
        return plan.rows[0].id;
    });
    res.status(201).json({ id });
}

// PATCH /api/membresias/planes/:id  (dueno). El precio y el nombre se reflejan
// en el servicio de la cuota; las membresias ya pagadas no cambian de periodo.
export async function actualizarPlan(req, res) {
    if (await sinModulo(req, res)) return;
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { datos, error } = limpiarPlan(req.body, { parcial: true });
    if (error) return res.status(400).json({ error });
    const { activo } = req.body;

    try {
        await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actual = await cliente.query(`SELECT * FROM membresia_planes WHERE id = $1 FOR UPDATE`, [id]);
            const p = actual.rows[0];
            if (!p) throw new ErrorNegocio('Plan no encontrado');
            await cliente.query(
                `UPDATE membresia_planes SET
                    nombre = COALESCE($2, nombre), descripcion = CASE WHEN $3::boolean THEN $4 ELSE descripcion END,
                    precio_mensual = COALESCE($5, precio_mensual), descuento_servicios_pct = COALESCE($6, descuento_servicios_pct),
                    dias_gracia = COALESCE($7, dias_gracia), activo = COALESCE($8, activo)
                 WHERE id = $1`,
                [
                    id, datos.nombre ?? null, 'descripcion' in datos, datos.descripcion ?? null,
                    datos.precioMensual ?? null, datos.descuentoServiciosPct ?? null, datos.diasGracia ?? null,
                    typeof activo === 'boolean' ? activo : null,
                ]
            );
            if (datos.nombre !== undefined || datos.precioMensual !== undefined || datos.tasaIva !== undefined) {
                await cliente.query(
                    `UPDATE productos SET
                        nombre = COALESCE($2, nombre),
                        precio_contado = COALESCE($3, precio_contado), precio_credito = COALESCE($3, precio_credito),
                        precio_mayorista = COALESCE($3, precio_mayorista),
                        tasa_iva = COALESCE($4, tasa_iva)
                     WHERE id = $1`,
                    [p.producto_id, datos.nombre !== undefined ? `Cuota Membresía ${datos.nombre}` : null, datos.precioMensual ?? null, datos.tasaIva ?? null]
                );
            }
        });
    } catch (err) {
        if (err instanceof ErrorNegocio) return res.status(404).json({ error: err.message });
        throw err;
    }
    res.json({ ok: true });
}

// ------------------------------------------------------------- membresias

function aMembresia(f) {
    const estado = estadoDeMembresia({ cancelada: f.cancelada, dias: f.dias, diasGracia: f.dias_gracia });
    return {
        id: f.id,
        clienteId: f.cliente_id,
        clienteNombre: f.cliente_nombre,
        clienteCelular: f.cliente_celular,
        planId: f.plan_id,
        planNombre: f.plan_nombre,
        planProductoId: f.plan_producto_id,
        precioMensual: Number(f.precio_mensual),
        diasGracia: Number(f.dias_gracia),
        descuentoServiciosPct: Number(f.descuento_servicios_pct),
        altaEn: f.alta_en,
        cancelada: f.cancelada,
        notas: f.notas,
        venceEn: f.vence_en,
        dias: f.dias === null ? null : Number(f.dias),
        estado,
    };
}

const SELECT_MEMBRESIAS = `
    SELECT m.id, m.cliente_id, m.plan_id, to_char(m.alta_en, 'YYYY-MM-DD') AS alta_en, m.cancelada, m.notas,
           c.nombre AS cliente_nombre, c.celular AS cliente_celular,
           mp.nombre AS plan_nombre, mp.producto_id AS plan_producto_id, mp.precio_mensual,
           mp.dias_gracia, mp.descuento_servicios_pct,
           to_char(v.vence, 'YYYY-MM-DD') AS vence_en, (v.vence - ${SQL_HOY_PY}) AS dias
      FROM membresias m
      JOIN clientes c ON c.id = m.cliente_id
      JOIN membresia_planes mp ON mp.id = m.plan_id
      LEFT JOIN LATERAL (
          SELECT max(x.periodo_hasta) AS vence FROM membresia_pagos x
           WHERE x.membresia_id = m.id AND x.anulado = false
      ) v ON true`;

// GET /api/membresias?estado=todas|activas|por_vencer|gracia|vencidas|pendientes|canceladas&q=
// "por_vencer" = activas que vencen en 7 dias o menos.
export async function listarMembresias(req, res) {
    if (await sinModulo(req, res)) return;
    const { empresaId } = req.usuario;
    const filtro = String(req.query.estado || 'vigentes');
    const q = String(req.query.q || '').trim();
    const r = await consultaDeEmpresa(
        empresaId,
        `${SELECT_MEMBRESIAS}
         WHERE ($1 = '' OR unaccent(lower(c.nombre)) LIKE unaccent(lower('%' || $1 || '%')) OR c.celular LIKE '%' || $1 || '%')
         ORDER BY m.cancelada, c.nombre`,
        [q]
    );
    let lista = r.rows.map(aMembresia);
    if (filtro === 'vigentes') lista = lista.filter((m) => !m.cancelada);
    else if (filtro === 'activas') lista = lista.filter((m) => m.estado === 'activa');
    else if (filtro === 'por_vencer') lista = lista.filter((m) => m.estado === 'activa' && m.dias <= 7);
    else if (filtro === 'gracia') lista = lista.filter((m) => m.estado === 'gracia');
    else if (filtro === 'vencidas') lista = lista.filter((m) => m.estado === 'vencida');
    else if (filtro === 'pendientes') lista = lista.filter((m) => m.estado === 'pendiente');
    else if (filtro === 'canceladas') lista = lista.filter((m) => m.cancelada);
    // 'todas': sin filtrar.
    res.json({ membresias: lista });
}

// GET /api/membresias/:id  (con el historial de cuotas pagadas)
export async function obtenerMembresia(req, res) {
    if (await sinModulo(req, res)) return;
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const m = await consultaDeEmpresa(empresaId, `${SELECT_MEMBRESIAS} WHERE m.id = $1`, [id]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Membresía no encontrada' });
    const pagos = await consultaDeEmpresa(
        empresaId,
        `SELECT mpg.id, to_char(mpg.periodo_desde, 'YYYY-MM-DD') AS periodo_desde,
                to_char(mpg.periodo_hasta, 'YYYY-MM-DD') AS periodo_hasta, mpg.monto, mpg.anulado,
                mpg.creado_en, v.id AS venta_id, v.numero_ticket
           FROM membresia_pagos mpg JOIN ventas v ON v.id = mpg.venta_id
          WHERE mpg.membresia_id = $1 ORDER BY mpg.creado_en DESC`,
        [id]
    );
    res.json({
        ...aMembresia(m.rows[0]),
        pagos: pagos.rows.map((p) => ({
            id: p.id,
            ventaId: p.venta_id,
            numeroTicket: p.numero_ticket,
            periodoDesde: p.periodo_desde,
            periodoHasta: p.periodo_hasta,
            monto: Number(p.monto),
            anulado: p.anulado,
            creadoEn: p.creado_en,
        })),
    });
}

// POST /api/membresias  { clienteId, planId, notas }  (dueno/encargado)
export async function crearMembresia(req, res) {
    if (await sinModulo(req, res)) return;
    const { empresaId } = req.usuario;
    const { clienteId, planId } = req.body;
    const notas = String(req.body.notas ?? '').trim().slice(0, 300) || null;
    if (!clienteId || !planId) return res.status(400).json({ error: 'Elegí el cliente y el plan' });

    try {
        const id = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const c = await cliente.query(`SELECT id, es_generico, activo FROM clientes WHERE id = $1`, [clienteId]);
            if (!c.rows[0] || !c.rows[0].activo) throw new ErrorNegocio('El cliente no existe');
            if (c.rows[0].es_generico) throw new ErrorNegocio('La membresía necesita un cliente registrado (no Consumidor Final)');
            const p = await cliente.query(`SELECT activo FROM membresia_planes WHERE id = $1`, [planId]);
            if (!p.rows[0]) throw new ErrorNegocio('El plan no existe');
            if (!p.rows[0].activo) throw new ErrorNegocio('Ese plan está desactivado');
            const r = await cliente.query(
                `INSERT INTO membresias (empresa_id, cliente_id, plan_id, notas) VALUES ($1, $2, $3, $4) RETURNING id`,
                [empresaId, clienteId, planId, notas]
            );
            return r.rows[0].id;
        });
        res.status(201).json({ id });
    } catch (err) {
        if (err instanceof ErrorNegocio) return res.status(400).json({ error: err.message });
        if (err.code === '23505') return res.status(400).json({ error: 'Ese cliente ya tiene una membresía vigente' });
        throw err;
    }
}

// PATCH /api/membresias/:id  { cancelada?, notas? }  (dueno/encargado)
export async function actualizarMembresia(req, res) {
    if (await sinModulo(req, res)) return;
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { cancelada } = req.body;
    const tocaNotas = req.body.notas !== undefined;
    const notas = String(req.body.notas ?? '').trim().slice(0, 300) || null;
    try {
        const r = await consultaDeEmpresa(
            empresaId,
            `UPDATE membresias SET cancelada = COALESCE($2, cancelada),
                    notas = CASE WHEN $3::boolean THEN $4 ELSE notas END
              WHERE id = $1 RETURNING id`,
            [id, typeof cancelada === 'boolean' ? cancelada : null, tocaNotas, notas]
        );
        if (!r.rows[0]) return res.status(404).json({ error: 'Membresía no encontrada' });
        res.json({ ok: true });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Ese cliente ya tiene otra membresía vigente: cancelala primero' });
        }
        throw err;
    }
}
