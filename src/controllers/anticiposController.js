import bcrypt from 'bcrypt';
import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { turnoAbiertoDe } from './turnosController.js';
import { tienePermiso } from '../utils/permisos.js';

const ORIGENES = [
    { campo: 'presupuestoId', columna: 'presupuesto_id', tabla: 'presupuestos' },
    { campo: 'internacionId', columna: 'internacion_id', tabla: 'internaciones' },
    { campo: 'reparacionId', columna: 'reparacion_id', tabla: 'reparaciones' },
];

// Un anticipo es plata que el cliente deja ANTES de que exista una venta
// final (internacion, reparacion o presupuesto) - se suma a caja el mismo
// dia que se recibe (turno propio, igual que un cobro), y mas adelante se
// convierte en una linea de pago mas dentro de la venta que finalmente se
// genera (ver ventasController.js: crearVenta).
export async function crearAnticipo(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { clienteId, monto, formaPago, presupuestoId, internacionId, reparacionId, nota } = req.body;

    if (!clienteId) {
        return res.status(400).json({ error: 'Falta el cliente' });
    }
    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    const origenesPresentes = [presupuestoId, internacionId, reparacionId].filter(Boolean);
    if (origenesPresentes.length !== 1) {
        return res.status(400).json({ error: 'El anticipo tiene que ser de un presupuesto, una internación o una reparación (uno solo)' });
    }

    try {
        const anticipo = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const clienteExiste = await cliente.query(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
            if (!clienteExiste.rows[0]) {
                throw new ErrorNegocio('El cliente no existe');
            }
            for (const origen of ORIGENES) {
                const valor = req.body[origen.campo];
                if (!valor) continue;
                const existe = await cliente.query(`SELECT id FROM ${origen.tabla} WHERE id = $1`, [valor]);
                if (!existe.rows[0]) {
                    throw new ErrorNegocio('El pedido al que corresponde este anticipo no existe');
                }
            }

            const turnoId = await turnoAbiertoDe(cliente, usuarioId);

            const resultado = await cliente.query(
                `INSERT INTO anticipos
                    (empresa_id, cliente_id, presupuesto_id, internacion_id, reparacion_id,
                     monto, forma_pago, turno_id, usuario_id, nota)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [empresaId, clienteId, presupuestoId || null, internacionId || null, reparacionId || null,
                    monto, formaPago, turnoId, usuarioId, nota || null]
            );
            return resultado.rows[0];
        });
        res.status(201).json(anticipo);
    } catch (err) {
        if (err instanceof ErrorNegocio) {
            return res.status(400).json({ error: err.message });
        }
        throw err;
    }
}

export async function listarAnticipos(req, res) {
    const { empresaId } = req.usuario;
    const { presupuestoId, internacionId, reparacionId } = req.query;

    const origen = ORIGENES.find((o) => req.query[o.campo]);
    if (!origen) {
        return res.status(400).json({ error: 'Indicá de qué presupuesto, internación o reparación' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT a.*, u.nombre AS usuario_nombre, au.nombre AS anulado_por_nombre
         FROM anticipos a
         JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN usuarios au ON au.id = a.anulado_por
         WHERE a.${origen.columna} = $1
         ORDER BY a.creado_en DESC`,
        [req.query[origen.campo]]
    );

    res.json(resultado.rows);
}

// Copia textual del bloque de PIN de ventasController.js's anularVenta:
// dueño/encargado (o cajero con el permiso anular_sin_pin) se autoriza
// solo, cualquier otro cajero necesita el PIN de algun dueño/encargado
// activo. No genera ningun movimiento de caja nuevo — la fila deja de
// sumar en efectivoEsperadoDeTurno de ahi en adelante, igual que una
// venta anulada.
export async function anularAnticipo(req, res) {
    const { empresaId, usuarioId, rol } = req.usuario;
    const { id } = req.params;
    const { motivo, pin } = req.body;

    if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'Indicá el motivo de la anulación' });
    }

    try {
        const resultado = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const anticipoResultado = await cliente.query(`SELECT * FROM anticipos WHERE id = $1 FOR UPDATE`, [id]);
            const anticipo = anticipoResultado.rows[0];
            if (!anticipo) {
                throw new ErrorNegocio('El anticipo no existe');
            }
            if (anticipo.estado === 'anulado') {
                throw new ErrorNegocio('Este anticipo ya está anulado');
            }
            if (anticipo.estado === 'aplicado') {
                throw new ErrorNegocio('Este anticipo ya se aplicó a una venta — no se puede anular directamente');
            }

            let autorizadoPor = usuarioId;
            if (rol === 'cajero' && !(await tienePermiso(empresaId, usuarioId, 'anular_sin_pin'))) {
                if (!pin) {
                    throw new ErrorNegocio('Necesitás el PIN de un dueño o encargado para anular');
                }
                const supervisores = await cliente.query(
                    `SELECT id, pin_hash FROM usuarios
                     WHERE empresa_id = $1 AND rol IN ('dueno', 'encargado') AND activo = true AND pin_hash IS NOT NULL`,
                    [empresaId]
                );
                let coincidencia = null;
                for (const s of supervisores.rows) {
                    if (await bcrypt.compare(pin, s.pin_hash)) {
                        coincidencia = s.id;
                        break;
                    }
                }
                if (!coincidencia) {
                    throw new ErrorNegocio('PIN de autorización incorrecto');
                }
                autorizadoPor = coincidencia;
            }

            const actualizado = await cliente.query(
                `UPDATE anticipos
                 SET estado = 'anulado', anulado_en = now(), anulado_por = $2, motivo_anulacion = $3
                 WHERE id = $1
                 RETURNING *`,
                [id, autorizadoPor, motivo.trim()]
            );
            return actualizado.rows[0];
        });
        res.json(resultado);
    } catch (err) {
        if (err instanceof ErrorNegocio) {
            return res.status(400).json({ error: err.message });
        }
        throw err;
    }
}
