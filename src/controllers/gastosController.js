import pool, { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { rangoDelMes } from '../utils/rangoDelMes.js';

const CATEGORIAS_VALIDAS = [
    'servicios_fijos', 'software_suscripciones', 'personal',
    'vehiculo_transporte', 'equipos_inversion', 'otros',
];

function validarCategoria(categoria) {
    return CATEGORIAS_VALIDAS.includes(categoria);
}

// ---------------------------------------------------------------------
// Gastos puntuales
// ---------------------------------------------------------------------

export async function listarGastos(req, res) {
    const { empresaId } = req.usuario;
    const { desde, hasta } = req.query;

    const condiciones = [];
    const valores = [];
    if (desde) {
        valores.push(desde);
        condiciones.push(`fecha_gasto >= $${valores.length}::date`);
    }
    if (hasta) {
        valores.push(hasta);
        condiciones.push(`fecha_gasto < ($${valores.length}::date + INTERVAL '1 day')`);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM gastos ${where} ORDER BY fecha_gasto DESC, creado_en DESC LIMIT 300`,
        valores
    );
    res.json(resultado.rows);
}

export async function crearGasto(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { categoria, descripcion, monto, fechaGasto } = req.body;

    if (!validarCategoria(categoria)) {
        return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (!descripcion || !descripcion.trim()) {
        return res.status(400).json({ error: 'La descripción es obligatoria' });
    }
    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO gastos (empresa_id, categoria, descripcion, monto, fecha_gasto, usuario_id)
         VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6)
         RETURNING *`,
        [empresaId, categoria, descripcion.trim(), monto, fechaGasto || null, usuarioId]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function actualizarGasto(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { categoria, descripcion, monto, fechaGasto } = req.body;

    if (categoria !== undefined && !validarCategoria(categoria)) {
        return res.status(400).json({ error: 'Categoría inválida' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE gastos SET
            categoria = COALESCE($2, categoria),
            descripcion = COALESCE($3, descripcion),
            monto = COALESCE($4, monto),
            fecha_gasto = COALESCE($5, fecha_gasto)
         WHERE id = $1
         RETURNING *`,
        [id, categoria, descripcion, monto, fechaGasto]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    res.json(resultado.rows[0]);
}

export async function eliminarGasto(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(empresaId, `DELETE FROM gastos WHERE id = $1 RETURNING id`, [id]);
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    res.json({ ok: true });
}

// ---------------------------------------------------------------------
// Gastos recurrentes (plantillas)
// ---------------------------------------------------------------------

export async function listarRecurrentes(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM gastos_recurrentes ORDER BY activo DESC, descripcion ASC`,
        []
    );
    res.json(resultado.rows);
}

export async function crearRecurrente(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { categoria, descripcion, montoAproximado } = req.body;

    if (!validarCategoria(categoria)) {
        return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (!descripcion || !descripcion.trim()) {
        return res.status(400).json({ error: 'La descripción es obligatoria' });
    }
    if (!(Number(montoAproximado) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO gastos_recurrentes (empresa_id, categoria, descripcion, monto_aproximado, usuario_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [empresaId, categoria, descripcion.trim(), montoAproximado, usuarioId]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function actualizarRecurrente(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { categoria, descripcion, montoAproximado, activo } = req.body;

    if (categoria !== undefined && !validarCategoria(categoria)) {
        return res.status(400).json({ error: 'Categoría inválida' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE gastos_recurrentes SET
            categoria = COALESCE($2, categoria),
            descripcion = COALESCE($3, descripcion),
            monto_aproximado = COALESCE($4, monto_aproximado),
            activo = COALESCE($5, activo)
         WHERE id = $1
         RETURNING *`,
        [id, categoria, descripcion, montoAproximado, activo]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Gasto recurrente no encontrado' });
    }
    res.json(resultado.rows[0]);
}

// ---------------------------------------------------------------------
// Prestamos
// ---------------------------------------------------------------------

export async function listarPrestamos(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM prestamos ORDER BY activo DESC, creado_en DESC`,
        []
    );
    res.json(resultado.rows);
}

export async function crearPrestamo(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { montoRecibido, saldoPendiente, cuotaMensual, tasaInteres, proximoVencimiento } = req.body;

    if (!(Number(montoRecibido) > 0)) {
        return res.status(400).json({ error: 'El monto recibido debe ser mayor a cero' });
    }
    if (!(Number(cuotaMensual) > 0)) {
        return res.status(400).json({ error: 'La cuota mensual debe ser mayor a cero' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO prestamos (empresa_id, monto_recibido, saldo_pendiente, cuota_mensual, tasa_interes, proximo_vencimiento, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            empresaId,
            montoRecibido,
            saldoPendiente ?? montoRecibido,
            cuotaMensual,
            tasaInteres || null,
            proximoVencimiento || null,
            usuarioId,
        ]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function actualizarPrestamo(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { saldoPendiente, cuotaMensual, tasaInteres, proximoVencimiento, activo } = req.body;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE prestamos SET
            saldo_pendiente = COALESCE($2, saldo_pendiente),
            cuota_mensual = COALESCE($3, cuota_mensual),
            tasa_interes = COALESCE($4, tasa_interes),
            proximo_vencimiento = COALESCE($5, proximo_vencimiento),
            activo = COALESCE($6, activo)
         WHERE id = $1
         RETURNING *`,
        [id, saldoPendiente, cuotaMensual, tasaInteres, proximoVencimiento, activo]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Préstamo no encontrado' });
    }
    res.json(resultado.rows[0]);
}

// Registra el pago de la cuota del mes: resta cuota_mensual (o un monto
// puntual) del saldo pendiente y adelanta un mes el proximo vencimiento.
export async function pagarCuotaPrestamo(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { monto } = req.body;

    const actual = await consultaDeEmpresa(empresaId, `SELECT * FROM prestamos WHERE id = $1`, [id]);
    const prestamo = actual.rows[0];
    if (!prestamo) {
        return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    const montoPagado = Number(monto) > 0 ? Number(monto) : Number(prestamo.cuota_mensual);
    const nuevoSaldo = Math.max(0, Number(prestamo.saldo_pendiente) - montoPagado);
    const nuevoVencimiento = prestamo.proximo_vencimiento
        ? new Date(new Date(prestamo.proximo_vencimiento).setMonth(new Date(prestamo.proximo_vencimiento).getMonth() + 1))
            .toISOString()
            .slice(0, 10)
        : null;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE prestamos SET saldo_pendiente = $2, proximo_vencimiento = $3 WHERE id = $1 RETURNING *`,
        [id, nuevoSaldo, nuevoVencimiento]
    );
    res.json(resultado.rows[0]);
}

// ---------------------------------------------------------------------
// Balance mensual
// ---------------------------------------------------------------------

export async function obtenerBalanceMensual(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    // Un periodo personalizado (desde/hasta) no dispara la precarga de
    // recurrentes: esa precarga es un concepto mensual (un gasto por mes),
    // y generarla para una ventana arbitraria duplicaria gastos cada vez
    // que se elige un rango distinto dentro del mismo mes.
    const rangoPersonalizado = Boolean(req.query.desde && req.query.hasta);
    const { desde, hasta } = rangoPersonalizado
        ? { desde: req.query.desde, hasta: req.query.hasta }
        : rangoDelMes(req.query.mes);

    if (!rangoPersonalizado) {
    await transaccionDeEmpresa(empresaId, async (cliente) => {
        // Precarga perezosa: cada plantilla activa que todavia no tenga un
        // gasto generado para este mes, se crea ahora con el monto
        // aproximado (el dueno lo puede editar despues sin afectar la
        // plantilla).
        const plantillas = await cliente.query(
            `SELECT gr.* FROM gastos_recurrentes gr WHERE gr.activo = true
             AND NOT EXISTS (
                 SELECT 1 FROM gastos g
                 WHERE g.recurrente_id = gr.id
                 AND g.fecha_gasto >= $1::date AND g.fecha_gasto <= $2::date
             )`,
            [desde, hasta]
        );
        for (const plantilla of plantillas.rows) {
            await cliente.query(
                `INSERT INTO gastos (empresa_id, categoria, descripcion, monto, fecha_gasto, recurrente_id, usuario_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [empresaId, plantilla.categoria, plantilla.descripcion, plantilla.monto_aproximado, desde, plantilla.id, usuarioId]
            );
        }
    });
    }

    const whereFecha = (columna) => `${columna} >= $1::date AND ${columna} < ($2::date + INTERVAL '1 day')`;

    const ventasContado = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(total), 0) AS total FROM ventas WHERE anulada = false AND tipo_pago <> 'credito' AND ${whereFecha('creado_en')}`,
        [desde, hasta]
    );
    const cobrosFiado = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(monto), 0) AS total FROM cobros WHERE ${whereFecha('creado_en')}`,
        [desde, hasta]
    );
    const gastosPorCategoria = await consultaDeEmpresa(
        empresaId,
        `SELECT categoria, COALESCE(SUM(monto), 0) AS total FROM gastos WHERE ${whereFecha('fecha_gasto')} GROUP BY categoria`,
        [desde, hasta]
    );
    // Costo de lo efectivamente vendido en el periodo (a costo promedio
    // ponderado, congelado por venta - ver venta_items.costo_unitario), no
    // lo que se pago a proveedores ese mes: pagar stock que todavia no se
    // vendio no es una perdida, y contarlo aparte de la venta que lo
    // origina inflaria o desinflaria el resultado segun cuando se compro.
    // Se cuentan tanto ventas de contado como a credito - el costo sale de
    // la mercaderia cuando se vende, no cuando se cobra.
    const costoMercaderiaVendida = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(vi.cantidad * vi.costo_unitario), 0) AS total
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id
         WHERE v.anulada = false AND ${whereFecha('v.creado_en')}`,
        [desde, hasta]
    );
    const consumoInterno = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(cantidad * costo_unitario), 0) AS total FROM salidas_stock
         WHERE motivo = 'consumo_interno' AND ${whereFecha('fecha')}`,
        [desde, hasta]
    );
    const merma = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(cantidad * costo_unitario), 0) AS total FROM salidas_stock
         WHERE motivo IN ('merma_vencimiento', 'rotura_robo') AND ${whereFecha('fecha')}`,
        [desde, hasta]
    );
    const prestamos = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM prestamos WHERE activo = true ORDER BY creado_en DESC`,
        []
    );
    const retirosPorMotivo = await consultaDeEmpresa(
        empresaId,
        `SELECT motivo, COALESCE(SUM(monto), 0) AS total FROM retiros_caja WHERE ${whereFecha('creado_en')} GROUP BY motivo`,
        [desde, hasta]
    );

    const desglose = Object.fromEntries(gastosPorCategoria.rows.map((f) => [f.categoria, Number(f.total)]));
    const inversionEquipos = desglose.equipos_inversion || 0;
    const gastosOperativos = gastosPorCategoria.rows
        .filter((f) => f.categoria !== 'equipos_inversion')
        .reduce((acumulado, f) => acumulado + Number(f.total), 0);

    // Retiros de caja: segun el motivo se cuentan como gasto operativo
    // (pago a proveedor / gasto puntual), quedan aparte sin afectar el
    // resultado (retiro personal del dueno, mismo trato que prestamos e
    // inversion en equipos), o quedan marcados para revisar a mano (envio
    // con tercero / otro) - no se sabe de antemano si son gasto del
    // negocio o no, asi que no se cuentan solos en ningun lado.
    const desgloseRetiros = Object.fromEntries(retirosPorMotivo.rows.map((f) => [f.motivo, Number(f.total)]));
    const retirosOperativos = (desgloseRetiros.pago_proveedor || 0) + (desgloseRetiros.gasto_puntual || 0);
    const retirosPersonales = desgloseRetiros.retiro_personal || 0;
    const retirosARevisar = (desgloseRetiros.envio_tercero || 0) + (desgloseRetiros.otro || 0);

    const ingresos = Number(ventasContado.rows[0].total) + Number(cobrosFiado.rows[0].total);
    const montoCostoMercaderiaVendida = Number(costoMercaderiaVendida.rows[0].total);
    const montoConsumoInterno = Number(consumoInterno.rows[0].total);
    const montoMerma = Number(merma.rows[0].total);
    const resultadoOperativo =
        ingresos - gastosOperativos - montoCostoMercaderiaVendida - montoConsumoInterno - montoMerma - retirosOperativos;

    res.json({
        desde,
        hasta,
        ingresos,
        ventasContado: Number(ventasContado.rows[0].total),
        cobrosFiado: Number(cobrosFiado.rows[0].total),
        gastosOperativos,
        gastosPorCategoria: desglose,
        costoMercaderiaVendida: montoCostoMercaderiaVendida,
        consumoInterno: montoConsumoInterno,
        merma: montoMerma,
        retirosOperativos,
        resultadoOperativo,
        inversionEquipos,
        prestamos: prestamos.rows,
        retirosPersonales,
        retirosARevisar,
    });
}
