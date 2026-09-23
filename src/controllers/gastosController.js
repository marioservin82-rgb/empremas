import pool, { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { rangoDelMes } from '../utils/rangoDelMes.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

const CATEGORIAS_VALIDAS = [
    'servicios_fijos', 'software_suscripciones', 'personal',
    'vehiculo_transporte', 'equipos_inversion', 'otros',
];
const FORMAS_PAGO_VALIDAS = ['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito'];

function validarCategoria(categoria) {
    return CATEGORIAS_VALIDAS.includes(categoria);
}

// Mismo patron que generarRetiroPorPagoDeCompra (comprasController): pagar
// un gasto en efectivo "de la caja" genera un retiro contra el turno
// abierto del usuario, asi la reconciliacion de cierre lo refleja solo -
// sin esto, ese efectivo saldria del cajon sin ninguna explicacion en el
// cierre de turno.
async function generarRetiroPorGasto(cliente, { empresaId, usuarioId, gastoId, descripcion, monto }) {
    const turnoRes = await cliente.query(
        `SELECT id, sucursal_id FROM turnos WHERE usuario_id = $1 AND estado = 'abierto' LIMIT 1`,
        [usuarioId]
    );
    const turno = turnoRes.rows[0];
    if (!turno) {
        throw new ErrorNegocio(
            'Elegiste "de la caja" pero no tenés una caja abierta. Abrí la caja o elegí "Administración".'
        );
    }
    const usuario = await cliente.query(`SELECT nombre FROM usuarios WHERE id = $1`, [usuarioId]);
    await cliente.query(
        `INSERT INTO retiros_caja
            (empresa_id, turno_id, sucursal_id, monto, motivo, motivo_detalle, persona_retira, usuario_id, autorizado_por, gasto_id)
         VALUES ($1, $2, $3, $4, 'gasto_puntual', $5, $6, $7, $7, $8)`,
        [empresaId, turno.id, turno.sucursal_id, monto, descripcion, usuario.rows[0]?.nombre || 'Gasto puntual', usuarioId, gastoId]
    );
}

// Borra el retiro autogenerado por un gasto si su turno sigue abierto
// (uno de un turno ya cerrado no se puede deshacer sin descuadrar un
// cierre) - mismo criterio que revertirRetirosDeCompra.
async function revertirRetiroPorGasto(cliente, gastoId) {
    const bloqueado = await cliente.query(
        `SELECT r.id FROM retiros_caja r JOIN turnos t ON t.id = r.turno_id
          WHERE r.gasto_id = $1 AND t.estado <> 'abierto'`,
        [gastoId]
    );
    await cliente.query(
        `DELETE FROM retiros_caja r
          USING turnos t
          WHERE r.turno_id = t.id AND r.gasto_id = $1 AND t.estado = 'abierto'`,
        [gastoId]
    );
    return bloqueado.rows.length > 0;
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
    const { categoria, descripcion, monto, fechaGasto, ordenProduccionId, formaPago, origen } = req.body;

    if (!validarCategoria(categoria)) {
        return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (!descripcion || !descripcion.trim()) {
        return res.status(400).json({ error: 'La descripción es obligatoria' });
    }
    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    if (!FORMAS_PAGO_VALIDAS.includes(formaPago)) {
        return res.status(400).json({ error: 'Indicá cómo se pagó este gasto' });
    }
    const origenFinal = formaPago === 'efectivo' && origen === 'caja' ? 'caja' : formaPago === 'efectivo' ? 'administracion' : null;

    try {
        const gasto = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const gastoInsertado = await cliente.query(
                `INSERT INTO gastos (empresa_id, categoria, descripcion, monto, fecha_gasto, usuario_id, orden_produccion_id, forma_pago, origen)
                 VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7, $8, $9)
                 RETURNING *`,
                [empresaId, categoria, descripcion.trim(), monto, fechaGasto || null, usuarioId, ordenProduccionId || null, formaPago, origenFinal]
            );
            const nuevoGasto = gastoInsertado.rows[0];

            if (origenFinal === 'caja') {
                await generarRetiroPorGasto(cliente, {
                    empresaId,
                    usuarioId,
                    gastoId: nuevoGasto.id,
                    descripcion: nuevoGasto.descripcion,
                    monto: nuevoGasto.monto,
                });
            }

            return nuevoGasto;
        });
        res.status(201).json(gasto);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
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

    try {
        const resultado = await transaccionDeEmpresa(empresaId, async (cliente) => {
            // Si este gasto genero un retiro de caja (efectivo "de la caja")
            // y su turno ya cerro, no se puede deshacer sin descuadrar ese
            // cierre - se avisa en vez de dejar un retiro huerfano o fallar
            // con un error de base de datos por la referencia (gasto_id).
            const bloqueado = await revertirRetiroPorGasto(cliente, id);
            if (bloqueado) {
                throw new ErrorNegocio(
                    'Este gasto generó un retiro de caja en un turno que ya cerró — no se puede eliminar sin descuadrar ese cierre.'
                );
            }
            const borrado = await cliente.query(`DELETE FROM gastos WHERE id = $1 RETURNING id`, [id]);
            return borrado.rows[0];
        });
        if (!resultado) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }
        res.json({ ok: true });
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
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
    // Se separa "pago_proveedor" segun si esta vinculado a una compra
    // (compra_id) y "gasto_puntual" segun si esta vinculado a un gasto
    // (gasto_id) o fue cargado suelto a mano desde Caja - ver el desglose
    // de retirosOperativos mas abajo para el porque.
    const retirosPorMotivo = await consultaDeEmpresa(
        empresaId,
        `SELECT motivo, (compra_id IS NULL) AS sin_compra, (gasto_id IS NULL) AS sin_gasto,
                COALESCE(SUM(monto), 0) AS total
         FROM retiros_caja WHERE ${whereFecha('creado_en')} GROUP BY motivo, (compra_id IS NULL), (gasto_id IS NULL)`,
        [desde, hasta]
    );

    const desglose = Object.fromEntries(gastosPorCategoria.rows.map((f) => [f.categoria, Number(f.total)]));
    const inversionEquipos = desglose.equipos_inversion || 0;
    const gastosOperativos = gastosPorCategoria.rows
        .filter((f) => f.categoria !== 'equipos_inversion')
        .reduce((acumulado, f) => acumulado + Number(f.total), 0);

    // Retiros de caja: segun el motivo se cuentan como gasto operativo
    // (pago a proveedor sin compra asociada / gasto puntual), quedan aparte
    // sin afectar el resultado (retiro personal del dueno, mismo trato que
    // prestamos e inversion en equipos), o quedan marcados para revisar a
    // mano (envio con tercero / otro) - no se sabe de antemano si son gasto
    // del negocio o no, asi que no se cuentan solos en ningun lado.
    //
    // "pago_proveedor" con compra_id (el retiro que el sistema genera solo
    // al pagar una compra en efectivo) NO se cuenta como gasto operativo:
    // esa mercaderia ya se va a descontar como costoMercaderiaVendida el
    // dia que se venda (o queda como inversion en stock sin vender todavia,
    // igual que "pagar stock que no se vendio no es una perdida" en el
    // comentario de costoMercaderiaVendida mas arriba). Contarlo aca de
    // nuevo duplicaba el mismo costo. Se muestra aparte, informativo, para
    // que no desaparezca de la vista sin explicacion.
    //
    // "gasto_puntual" con gasto_id (el retiro que el sistema genera solo
    // al pagar un gasto en efectivo "de la caja") tampoco se cuenta aca:
    // ese mismo monto ya esta adentro de gastosOperativos, via la tabla
    // gastos. Solo el "gasto puntual" cargado suelto desde Caja (sin pasar
    // por Gastos) es un gasto real que no esta contado en ningun otro lado.
    let pagoProveedorSinCompra = 0;
    let pagoProveedorConCompra = 0;
    let gastoPuntualSinGasto = 0;
    let gastoPuntualConGasto = 0;
    let retirosPersonales = 0;
    let retirosARevisar = 0;
    for (const fila of retirosPorMotivo.rows) {
        const monto = Number(fila.total);
        if (fila.motivo === 'pago_proveedor') {
            if (fila.sin_compra) pagoProveedorSinCompra += monto;
            else pagoProveedorConCompra += monto;
        } else if (fila.motivo === 'gasto_puntual') {
            if (fila.sin_gasto) gastoPuntualSinGasto += monto;
            else gastoPuntualConGasto += monto;
        } else if (fila.motivo === 'retiro_personal') {
            retirosPersonales += monto;
        } else if (fila.motivo === 'envio_tercero' || fila.motivo === 'otro') {
            retirosARevisar += monto;
        }
    }
    const retirosOperativos = pagoProveedorSinCompra + gastoPuntualSinGasto;

    const ingresos = Math.round(Number(ventasContado.rows[0].total) + Number(cobrosFiado.rows[0].total));
    const montoCostoMercaderiaVendida = Math.round(Number(costoMercaderiaVendida.rows[0].total));
    const montoConsumoInterno = Math.round(Number(consumoInterno.rows[0].total));
    const montoMerma = Math.round(Number(merma.rows[0].total));
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
        pagoProveedorYaEnCosto: pagoProveedorConCompra,
    });
}
