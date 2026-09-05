import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { tienePermiso } from '../utils/permisos.js';

// Agenda del dia (Agenda de citas, modulo opcional). Cajero ve la agenda de
// su propia sucursal (con la sustitucion transversal del dueño ya resuelta
// en req.usuario.sucursalId, sin codigo extra aca); dueño/encargado/quien
// tenga ver_reportes puede ademas pedir otra sucursal puntual con
// ?sucursalId= - mismo criterio que resumenDia en ventasController.js.
export async function listarCitas(req, res) {
    const { empresaId, usuarioId, rol, sucursalId } = req.usuario;
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const profesionalId = req.query.profesionalId || null;
    const sucursalIdPedido = req.query.sucursalId || null;

    const puedeVerOtraSucursal =
        rol === 'dueno' || rol === 'encargado' || (await tienePermiso(empresaId, usuarioId, 'ver_reportes'));

    const condiciones = [
        `c.fecha_hora_inicio >= $1::date`,
        `c.fecha_hora_inicio < ($1::date + INTERVAL '1 day')`,
    ];
    const valores = [fecha];

    valores.push(puedeVerOtraSucursal && sucursalIdPedido ? sucursalIdPedido : sucursalId);
    condiciones.push(`c.sucursal_id = $${valores.length}`);

    if (profesionalId) {
        valores.push(profesionalId);
        condiciones.push(`c.profesional_id = $${valores.length}`);
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT c.*, cl.nombre AS cliente_nombre, cl.celular AS cliente_celular,
                p.nombre AS producto_nombre, pr.nombre AS profesional_nombre
         FROM citas c
         JOIN clientes cl ON cl.id = c.cliente_id
         JOIN productos p ON p.id = c.producto_id
         JOIN profesionales pr ON pr.id = c.profesional_id
         WHERE ${condiciones.join(' AND ')}
         ORDER BY c.fecha_hora_inicio ASC`,
        valores
    );

    res.json(resultado.rows);
}

export async function obtenerCita(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT c.*, cl.nombre AS cliente_nombre, cl.documento AS cliente_documento, cl.celular AS cliente_celular,
                p.nombre AS producto_nombre, p.unidad_medida,
                pr.nombre AS profesional_nombre, pr.vendedor_id AS profesional_vendedor_id
         FROM citas c
         JOIN clientes cl ON cl.id = c.cliente_id
         JOIN productos p ON p.id = c.producto_id
         JOIN profesionales pr ON pr.id = c.profesional_id
         WHERE c.id = $1`,
        [id]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Cita no encontrada' });
    }
    res.json(resultado.rows[0]);
}

export async function crearCita(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { clienteId, productoId, profesionalId, fechaHoraInicio, nota, duracionMinutos: duracionPedida } = req.body;

    if (!clienteId) {
        return res.status(400).json({ error: 'La cita necesita un cliente' });
    }
    if (!fechaHoraInicio) {
        return res.status(400).json({ error: 'La cita necesita fecha y hora' });
    }
    if (duracionPedida !== undefined && !(Number(duracionPedida) > 0)) {
        return res.status(400).json({ error: 'La duración debe ser mayor a 0' });
    }

    try {
        const cita = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const clienteResultado = await cliente.query(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
            if (!clienteResultado.rows[0]) {
                throw new ErrorNegocio('El cliente ya no existe');
            }

            const productoResultado = await cliente.query(
                `SELECT precio_contado, duracion_minutos, es_servicio, activo FROM productos WHERE id = $1`,
                [productoId]
            );
            const producto = productoResultado.rows[0];
            if (!producto || !producto.es_servicio || !producto.activo) {
                throw new ErrorNegocio('El servicio elegido ya no existe o no está disponible');
            }

            const profesionalResultado = await cliente.query(
                `SELECT sucursal_id FROM profesionales WHERE id = $1 AND activo = true`,
                [profesionalId]
            );
            const profesional = profesionalResultado.rows[0];
            if (!profesional) {
                throw new ErrorNegocio('El profesional elegido ya no existe o no está activo');
            }

            // Duracion aproximada: por defecto la del catalogo del servicio,
            // pero editable al reservar - el profesional a veces sabe que
            // ESTA atencion puntual va a llevar mas o menos tiempo (ej. pelo
            // muy largo), y la agenda tiene que reflejar el tiempo real para
            // no solapar la siguiente cita.
            const duracionMinutos = duracionPedida != null ? Number(duracionPedida) : producto.duracion_minutos;

            // Solapamiento: el profesional no puede tener otra cita (no
            // cancelada) que se cruce con el horario pedido. FOR UPDATE no
            // hace falta aca (no hay una unica fila a bloquear, son varias
            // posibles) - la unicidad real la da que dos POST simultaneos
            // para el mismo profesional en el mismo horario van a ver la
            // misma foto y ambos podrian pasar; el riesgo es aceptable para
            // un negocio chico (mismo criterio de "riesgo evitable pero
            // bajo" ya asumido en otras partes de esta app) y se puede
            // reforzar despues con un indice de exclusion si hace falta.
            const solapa = await cliente.query(
                `SELECT id FROM citas
                  WHERE profesional_id = $1 AND estado <> 'cancelada'
                    AND fecha_hora_inicio < $2::timestamptz + ($3 || ' minutes')::interval
                    AND fecha_hora_inicio + (duracion_minutos || ' minutes')::interval > $2::timestamptz`,
                [profesionalId, fechaHoraInicio, duracionMinutos]
            );
            if (solapa.rows[0]) {
                throw new ErrorNegocio('El profesional ya tiene una cita en ese horario');
            }

            const insertado = await cliente.query(
                `INSERT INTO citas (empresa_id, sucursal_id, profesional_id, cliente_id, producto_id, precio_unitario, fecha_hora_inicio, duracion_minutos, nota, usuario_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                    empresaId,
                    profesional.sucursal_id,
                    profesionalId,
                    clienteId,
                    productoId,
                    producto.precio_contado,
                    fechaHoraInicio,
                    duracionMinutos,
                    nota || null,
                    usuarioId,
                ]
            );
            return insertado.rows[0];
        });

        res.status(201).json(cita);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

const ESTADOS_ACTUALIZABLES = ['cancelada', 'no_asistio'];

// Marcar 'atendida' NO pasa por aca - eso solo ocurre al cobrar la cita
// (ver crearVenta con citaId), nunca a mano.
export async function actualizarEstadoCita(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { estado } = req.body;

    if (!ESTADOS_ACTUALIZABLES.includes(estado)) {
        return res.status(400).json({ error: "El estado debe ser 'cancelada' o 'no_asistio'" });
    }

    try {
        const resultado = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actual = await cliente.query(`SELECT estado FROM citas WHERE id = $1 FOR UPDATE`, [id]);
            if (!actual.rows[0]) {
                throw new ErrorNegocio('Cita no encontrada');
            }
            if (actual.rows[0].estado === 'atendida') {
                throw new ErrorNegocio('Esta cita ya fue cobrada, no se puede modificar');
            }
            const actualizado = await cliente.query(
                `UPDATE citas SET estado = $2 WHERE id = $1 RETURNING *`,
                [id, estado]
            );
            return actualizado.rows[0];
        });
        res.json(resultado);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            const status = error.message === 'Cita no encontrada' ? 404 : 400;
            return res.status(status).json({ error: error.message });
        }
        throw error;
    }
}

export async function listarProfesionales(req, res) {
    const { empresaId } = req.usuario;
    const { activo } = req.query;
    const condicion = activo === 'true' ? 'WHERE p.activo = true' : '';
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT p.*, u.nombre AS usuario_nombre, v.nombre AS vendedor_nombre
         FROM profesionales p
         LEFT JOIN usuarios u ON u.id = p.usuario_id
         LEFT JOIN vendedores v ON v.id = p.vendedor_id
         ${condicion}
         ORDER BY p.activo DESC, p.nombre ASC`,
        []
    );
    res.json(resultado.rows);
}

export async function crearProfesional(req, res) {
    const { empresaId, sucursalId } = req.usuario;
    const { nombre, telefono, sucursalId: sucursalElegida, usuarioId, vendedorId } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO profesionales (empresa_id, sucursal_id, nombre, telefono, usuario_id, vendedor_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [empresaId, sucursalElegida || sucursalId, nombre.trim(), telefono || null, usuarioId || null, vendedorId || null]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function actualizarProfesional(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, telefono, sucursalId, usuarioId, vendedorId, activo } = req.body;

    try {
        const resultado = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actualizado = await cliente.query(
                `UPDATE profesionales SET
                    nombre = COALESCE($3, nombre),
                    telefono = COALESCE($4, telefono),
                    sucursal_id = COALESCE($5, sucursal_id),
                    usuario_id = CASE WHEN $6::boolean THEN $7 ELSE usuario_id END,
                    vendedor_id = CASE WHEN $8::boolean THEN $9 ELSE vendedor_id END,
                    activo = COALESCE($10, activo)
                 WHERE id = $1 AND empresa_id = $2
                 RETURNING *`,
                [
                    id,
                    empresaId,
                    nombre,
                    telefono,
                    sucursalId,
                    usuarioId !== undefined,
                    usuarioId || null,
                    vendedorId !== undefined,
                    vendedorId || null,
                    activo,
                ]
            );
            if (!actualizado.rows[0]) {
                throw new ErrorNegocio('Profesional no encontrado');
            }
            return actualizado.rows[0];
        });
        res.json(resultado);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}
