import bcrypt from 'bcrypt';
import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { tienePermiso } from '../utils/permisos.js';

const MOTIVOS_VALIDOS = ['pago_proveedor', 'gasto_puntual', 'retiro_personal', 'envio_tercero', 'otro'];

export async function crearRetiro(req, res) {
    const { empresaId, usuarioId, rol } = req.usuario;
    const { id } = req.params;
    const { monto, motivo, motivoDetalle, personaRetira, pin } = req.body;

    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    if (!MOTIVOS_VALIDOS.includes(motivo)) {
        return res.status(400).json({ error: 'Motivo inválido' });
    }
    if (motivo === 'otro' && !motivoDetalle?.trim()) {
        return res.status(400).json({ error: 'Indicá el detalle del retiro' });
    }
    if (!personaRetira?.trim()) {
        return res.status(400).json({ error: 'Indicá quién retira o recibe el efectivo' });
    }

    try {
        const retiro = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const turnoResultado = await cliente.query(
                `SELECT * FROM turnos WHERE id = $1 AND usuario_id = $2 FOR UPDATE`,
                [id, usuarioId]
            );
            const turno = turnoResultado.rows[0];
            if (!turno) {
                throw new ErrorNegocio('El turno no existe');
            }
            if (turno.estado !== 'abierto') {
                throw new ErrorNegocio('Ese turno ya está cerrado');
            }

            // Solo dueno/encargado autorizan directo. Un cajero puede
            // registrar el retiro, pero siempre necesita el PIN de un
            // dueno/encargado - a diferencia de anular, aca no hay permiso
            // que salte este paso.
            let autorizadoPor = usuarioId;
            if (rol === 'cajero') {
                if (!pin) {
                    throw new ErrorNegocio('Necesitás el PIN de un dueño o encargado para autorizar el retiro');
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

            const insertado = await cliente.query(
                `INSERT INTO retiros_caja
                    (empresa_id, turno_id, sucursal_id, monto, motivo, motivo_detalle, persona_retira, usuario_id, autorizado_por)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [empresaId, id, turno.sucursal_id, monto, motivo, motivoDetalle || null, personaRetira.trim(), usuarioId, autorizadoPor]
            );

            const conNombres = await cliente.query(
                `SELECT r.*, ua.nombre AS autorizado_por_nombre, ur.nombre AS usuario_nombre
                 FROM retiros_caja r
                 JOIN usuarios ua ON ua.id = r.autorizado_por
                 JOIN usuarios ur ON ur.id = r.usuario_id
                 WHERE r.id = $1`,
                [insertado.rows[0].id]
            );
            return conNombres.rows[0];
        });

        res.status(201).json(retiro);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function listarRetirosDeTurno(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;

    const turnoResultado = await consultaDeEmpresa(
        empresaId,
        `SELECT usuario_id FROM turnos WHERE id = $1`,
        [id]
    );
    if (!turnoResultado.rows[0]) {
        return res.status(404).json({ error: 'El turno no existe' });
    }
    // Cualquiera puede ver los retiros de su propio turno (lo necesita la
    // pantalla de caja mientras esta abierto); ver los de un turno ajeno
    // requiere el mismo criterio que el historial de turnos.
    if (turnoResultado.rows[0].usuario_id !== usuarioId) {
        const { rol } = req.usuario;
        if (rol !== 'dueno' && rol !== 'encargado' && !(await tienePermiso(empresaId, usuarioId, 'ver_reportes'))) {
            return res.status(403).json({ error: 'No tenés permiso para ver esto' });
        }
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT r.*, ua.nombre AS autorizado_por_nombre, ur.nombre AS usuario_nombre
         FROM retiros_caja r
         JOIN usuarios ua ON ua.id = r.autorizado_por
         JOIN usuarios ur ON ur.id = r.usuario_id
         WHERE r.turno_id = $1
         ORDER BY r.creado_en DESC`,
        [id]
    );
    res.json(resultado.rows);
}
