import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// Turno abierto del usuario logueado, si tiene uno. Lo usan crearVenta,
// crearCobro y pagarProveedor para saber a que turno atar la operacion.
export async function turnoAbiertoDe(cliente, usuarioId) {
    const resultado = await cliente.query(
        `SELECT id FROM turnos WHERE usuario_id = $1 AND estado = 'abierto' LIMIT 1`,
        [usuarioId]
    );
    return resultado.rows[0]?.id ?? null;
}

// Cuanto efectivo deberia haber en un turno puntual, segun lo vendido y
// cobrado en efectivo durante el (menos vueltos y pagos a proveedor en
// efectivo). La usan tanto el cierre de caja como el semaforo financiero
// (para saber el efectivo disponible "ahora", sin cerrar nada).
async function efectivoEsperadoDeTurno(cliente, turnoId, montoInicial) {
    // v.anulada = false: una venta anulada devolvio la plata, no cuenta
    // como efectivo real en la caja.
    const efectivoVentas = await cliente.query(
        `SELECT COALESCE(SUM(vp.monto), 0) AS total
         FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
         WHERE v.turno_id = $1 AND vp.forma_pago = 'efectivo' AND v.anulada = false`,
        [turnoId]
    );
    const vueltoVentas = await cliente.query(
        `SELECT COALESCE(SUM(vuelto), 0) AS total FROM ventas WHERE turno_id = $1 AND anulada = false`,
        [turnoId]
    );
    const efectivoCobros = await cliente.query(
        `SELECT COALESCE(SUM(cp.monto), 0) AS total
         FROM cobro_pagos cp JOIN cobros c ON c.id = cp.cobro_id
         WHERE c.turno_id = $1 AND cp.forma_pago = 'efectivo'`,
        [turnoId]
    );
    const efectivoPagosProveedor = await cliente.query(
        `SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_proveedor WHERE turno_id = $1 AND forma_pago = 'efectivo'`,
        [turnoId]
    );

    return (
        Number(montoInicial) +
        Number(efectivoVentas.rows[0].total) -
        Number(vueltoVentas.rows[0].total) +
        Number(efectivoCobros.rows[0].total) -
        Number(efectivoPagosProveedor.rows[0].total)
    );
}

// Efectivo disponible "ahora mismo" para toda la empresa, sin cerrar
// ningun turno: suma el efectivo esperado de todos los turnos abiertos en
// este momento (puede haber mas de un cajero a la vez); si no hay ninguno
// abierto, usa lo declarado en el ultimo turno cerrado como punto de
// partida (asumiendo que ese efectivo sigue en la caja hasta que alguien
// abra el proximo turno).
export async function efectivoDisponibleActual(cliente, empresaId) {
    const abiertos = await cliente.query(
        `SELECT id, monto_inicial FROM turnos WHERE empresa_id = $1 AND estado = 'abierto'`,
        [empresaId]
    );

    if (abiertos.rows.length > 0) {
        let total = 0;
        for (const turno of abiertos.rows) {
            total += await efectivoEsperadoDeTurno(cliente, turno.id, turno.monto_inicial);
        }
        return total;
    }

    const ultimoCerrado = await cliente.query(
        `SELECT monto_declarado_cierre FROM turnos
         WHERE empresa_id = $1 AND estado = 'cerrado'
         ORDER BY cerrado_en DESC LIMIT 1`,
        [empresaId]
    );
    return Number(ultimoCerrado.rows[0]?.monto_declarado_cierre ?? 0);
}

export async function obtenerTurnoActual(req, res) {
    const { empresaId, usuarioId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM turnos WHERE usuario_id = $1 AND estado = 'abierto' LIMIT 1`,
        [usuarioId]
    );

    res.json(resultado.rows[0] || null);
}

export async function abrirTurno(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { montoInicial } = req.body;

    if (!(Number(montoInicial) >= 0)) {
        return res.status(400).json({ error: 'El monto inicial debe ser 0 o mayor' });
    }

    try {
        const turno = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const existente = await cliente.query(
                `SELECT id FROM turnos WHERE usuario_id = $1 AND estado = 'abierto' LIMIT 1`,
                [usuarioId]
            );
            if (existente.rows[0]) {
                throw new ErrorNegocio('Ya tenés un turno abierto');
            }

            const resultado = await cliente.query(
                `INSERT INTO turnos (empresa_id, usuario_id, sucursal_id, monto_inicial) VALUES ($1, $2, $3, $4) RETURNING *`,
                [empresaId, usuarioId, sucursalId, montoInicial]
            );
            return resultado.rows[0];
        });

        res.status(201).json(turno);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function cerrarTurno(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const { montoDeclarado } = req.body;

    if (!(Number(montoDeclarado) >= 0)) {
        return res.status(400).json({ error: 'El monto declarado debe ser 0 o mayor' });
    }

    try {
        const turno = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const resultado = await cliente.query(
                `SELECT * FROM turnos WHERE id = $1 AND usuario_id = $2 FOR UPDATE`,
                [id, usuarioId]
            );
            const turnoActual = resultado.rows[0];
            if (!turnoActual) {
                throw new ErrorNegocio('El turno no existe');
            }
            if (turnoActual.estado === 'cerrado') {
                throw new ErrorNegocio('Ese turno ya está cerrado');
            }

            const efectivoEsperado = await efectivoEsperadoDeTurno(cliente, id, turnoActual.monto_inicial);
            const diferencia = Number(montoDeclarado) - efectivoEsperado;

            const actualizado = await cliente.query(
                `UPDATE turnos SET
                    estado = 'cerrado',
                    efectivo_esperado = $2,
                    monto_declarado_cierre = $3,
                    diferencia = $4,
                    cerrado_en = now()
                 WHERE id = $1
                 RETURNING *`,
                [id, efectivoEsperado, montoDeclarado, diferencia]
            );
            return actualizado.rows[0];
        });

        res.json(turno);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function listarTurnos(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT t.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
         FROM turnos t
         JOIN usuarios u ON u.id = t.usuario_id
         LEFT JOIN sucursales s ON s.id = t.sucursal_id
         ORDER BY t.abierto_en DESC LIMIT 100`,
        []
    );

    res.json(resultado.rows);
}
