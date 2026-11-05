import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// Cuentas bancarias / billeteras de la empresa (tabla con RLS: siempre
// consultaDeEmpresa / transaccionDeEmpresa).

const TIPOS = ['cuenta_corriente', 'caja_ahorro', 'billetera'];

// GET /api/cuentas?activas=1  (cualquier rol: el cajero elige la cuenta al cobrar)
export async function listarCuentas(req, res) {
    const { empresaId } = req.usuario;
    const soloActivas = req.query.activas === '1';
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT id, nombre, banco, tipo, numero_cuenta, titular, es_principal, activa
           FROM cuentas_bancarias ${soloActivas ? 'WHERE activa = true' : ''}
          ORDER BY es_principal DESC, activa DESC, nombre`,
        []
    );
    res.json({ cuentas: r.rows });
}

function limpiar(body, { parcial }) {
    const out = {};
    if (body.nombre !== undefined || !parcial) {
        const nombre = String(body.nombre ?? '').trim();
        if (!nombre) return { error: 'Poné un nombre para la cuenta (ej.: Itaú cta. cte.)' };
        out.nombre = nombre.slice(0, 80);
    }
    if (body.tipo !== undefined) {
        if (!TIPOS.includes(body.tipo)) return { error: 'Tipo de cuenta inválido' };
        out.tipo = body.tipo;
    }
    for (const [campo, max] of [['banco', 80], ['numeroCuenta', 60], ['titular', 100]]) {
        if (body[campo] !== undefined) out[campo] = String(body[campo] ?? '').trim().slice(0, max) || null;
    }
    return { datos: out };
}

// POST /api/cuentas  (dueno). La primera cuenta queda como principal.
export async function crearCuenta(req, res) {
    const { empresaId } = req.usuario;
    const { datos, error } = limpiar(req.body, { parcial: false });
    if (error) return res.status(400).json({ error });
    const id = await transaccionDeEmpresa(empresaId, async (cliente) => {
        const hay = await cliente.query(`SELECT 1 FROM cuentas_bancarias WHERE activa = true AND es_principal = true`);
        const r = await cliente.query(
            `INSERT INTO cuentas_bancarias (empresa_id, nombre, banco, tipo, numero_cuenta, titular, es_principal)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [empresaId, datos.nombre, datos.banco ?? null, datos.tipo || 'cuenta_corriente', datos.numeroCuenta ?? null, datos.titular ?? null, hay.rows.length === 0]
        );
        return r.rows[0].id;
    });
    res.status(201).json({ id });
}

// PATCH /api/cuentas/:id  (dueno): editar, desactivar/reactivar, hacer principal.
// No se borra: los movimientos viejos siguen apuntando a la cuenta.
export async function actualizarCuenta(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { datos, error } = limpiar(req.body, { parcial: true });
    if (error) return res.status(400).json({ error });
    const { activa, esPrincipal } = req.body;

    try {
        await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actual = await cliente.query(`SELECT * FROM cuentas_bancarias WHERE id = $1 FOR UPDATE`, [id]);
            const c = actual.rows[0];
            if (!c) throw new ErrorNegocio('Cuenta no encontrada');

            const quedaActiva = typeof activa === 'boolean' ? activa : c.activa;
            let quedaPrincipal = typeof esPrincipal === 'boolean' ? esPrincipal : c.es_principal;
            if (!quedaActiva) quedaPrincipal = false;
            if (esPrincipal === true && !quedaActiva) throw new ErrorNegocio('Una cuenta desactivada no puede ser la principal');

            if (quedaPrincipal && !c.es_principal) {
                await cliente.query(`UPDATE cuentas_bancarias SET es_principal = false WHERE es_principal = true`);
            }
            await cliente.query(
                `UPDATE cuentas_bancarias SET
                    nombre = COALESCE($2, nombre), banco = CASE WHEN $3::boolean THEN $4 ELSE banco END,
                    tipo = COALESCE($5, tipo), numero_cuenta = CASE WHEN $6::boolean THEN $7 ELSE numero_cuenta END,
                    titular = CASE WHEN $8::boolean THEN $9 ELSE titular END,
                    activa = $10, es_principal = $11
                 WHERE id = $1`,
                [
                    id, datos.nombre ?? null,
                    'banco' in datos, datos.banco ?? null,
                    datos.tipo ?? null,
                    'numeroCuenta' in datos, datos.numeroCuenta ?? null,
                    'titular' in datos, datos.titular ?? null,
                    quedaActiva, quedaPrincipal,
                ]
            );

            // Si se desactivo (o desmarco) la principal, otra activa toma su lugar.
            const hayPrincipal = await cliente.query(`SELECT 1 FROM cuentas_bancarias WHERE activa = true AND es_principal = true`);
            if (hayPrincipal.rows.length === 0) {
                await cliente.query(
                    `UPDATE cuentas_bancarias SET es_principal = true
                      WHERE id = (SELECT id FROM cuentas_bancarias WHERE activa = true ORDER BY creado_en LIMIT 1)`
                );
            }
        });
    } catch (err) {
        if (err instanceof ErrorNegocio) return res.status(400).json({ error: err.message });
        throw err;
    }
    res.json({ ok: true });
}

// GET /api/cuentas/movimientos?desde=&hasta=&cuentaId=  (dueno/encargado)
// Todas las transferencias por cuenta: entradas (ventas, cobros, anticipos) y
// salidas (compras al contado, pagos a proveedores, gastos). cuentaId=sin => las
// que no tienen cuenta asignada (movimientos viejos).
export async function movimientosDeCuentas(req, res) {
    const { empresaId } = req.usuario;
    const { desde, hasta, cuentaId } = req.query;
    const hoy = new Date().toISOString().slice(0, 10);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(desde || '') ? desde : hoy;
    const h = /^\d{4}-\d{2}-\d{2}$/.test(hasta || '') ? hasta : d;

    // Cada fuente usa su propia fecha (en hora de Paraguay para las TIMESTAMPTZ).
    const filas = await consultaDeEmpresa(
        empresaId,
        `WITH m AS (
            SELECT 'entrada'::text AS sentido, 'Venta - ticket N° ' || v.numero_ticket AS concepto,
                   (v.creado_en AT TIME ZONE 'America/Asuncion')::date AS fecha, v.creado_en AS orden,
                   vp.cuenta_id, vp.nro_operacion, vp.monto
              FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
             WHERE vp.forma_pago = 'transferencia' AND v.anulada = false AND vp.origen_anticipo_id IS NULL
            UNION ALL
            SELECT 'entrada', 'Cobro a cliente - recibo N° ' || co.numero_recibo || ' (' || cl.nombre || ')',
                   (co.creado_en AT TIME ZONE 'America/Asuncion')::date, co.creado_en,
                   cp.cuenta_id, cp.nro_operacion, cp.monto
              FROM cobro_pagos cp JOIN cobros co ON co.id = cp.cobro_id JOIN clientes cl ON cl.id = co.cliente_id
             WHERE cp.forma_pago = 'transferencia'
            UNION ALL
            SELECT 'entrada', 'Anticipo - ' || cl.nombre,
                   (a.creado_en AT TIME ZONE 'America/Asuncion')::date, a.creado_en,
                   a.cuenta_id, a.nro_operacion, a.monto
              FROM anticipos a JOIN clientes cl ON cl.id = a.cliente_id
             WHERE a.forma_pago = 'transferencia' AND a.estado <> 'anulado'
            UNION ALL
            SELECT 'salida', 'Compra al contado - ' || pr.nombre,
                   c.fecha_compra, c.creado_en,
                   cpg.cuenta_id, cpg.nro_operacion, cpg.monto
              FROM compra_pagos cpg JOIN compras c ON c.id = cpg.compra_id JOIN proveedores pr ON pr.id = c.proveedor_id
             WHERE cpg.forma_pago = 'transferencia' AND c.anulada = false
            UNION ALL
            SELECT 'salida', 'Pago a proveedor - ' || pr.nombre,
                   pp.fecha_pago, pp.creado_en,
                   pp.cuenta_id, pp.nro_operacion, pp.monto
              FROM pagos_proveedor pp JOIN proveedores pr ON pr.id = pp.proveedor_id
             WHERE pp.forma_pago = 'transferencia'
            UNION ALL
            SELECT 'salida', 'Gasto - ' || COALESCE(g.descripcion, 'sin detalle'),
                   g.fecha_gasto, g.creado_en,
                   g.cuenta_id, g.nro_operacion, g.monto
              FROM gastos g
             WHERE g.forma_pago = 'transferencia'
        )
        SELECT m.sentido, m.concepto, m.fecha, m.cuenta_id, m.nro_operacion, m.monto,
               cb.nombre AS cuenta_nombre, cb.banco AS cuenta_banco
          FROM m LEFT JOIN cuentas_bancarias cb ON cb.id = m.cuenta_id
         WHERE m.fecha BETWEEN $1::date AND $2::date
           AND ($3::text IS NULL
                OR ($3 = 'sin' AND m.cuenta_id IS NULL)
                OR m.cuenta_id::text = $3)
         ORDER BY m.fecha, m.orden`,
        [d, h, cuentaId || null]
    );

    // Totales por cuenta (en JS, para no repetir la consulta).
    const porCuenta = new Map();
    for (const f of filas.rows) {
        const clave = f.cuenta_id || 'sin';
        if (!porCuenta.has(clave)) {
            porCuenta.set(clave, { cuentaId: f.cuenta_id, nombre: f.cuenta_nombre || 'Sin cuenta asignada', entro: 0, salio: 0 });
        }
        const t = porCuenta.get(clave);
        if (f.sentido === 'entrada') t.entro += Number(f.monto);
        else t.salio += Number(f.monto);
    }
    res.json({
        desde: d,
        hasta: h,
        totales: [...porCuenta.values()].map((t) => ({ ...t, neto: t.entro - t.salio })),
        movimientos: filas.rows.map((f) => ({
            sentido: f.sentido,
            concepto: f.concepto,
            fecha: f.fecha,
            cuentaId: f.cuenta_id,
            cuentaNombre: f.cuenta_nombre,
            cuentaBanco: f.cuenta_banco,
            nroOperacion: f.nro_operacion,
            monto: Number(f.monto),
        })),
    });
}
