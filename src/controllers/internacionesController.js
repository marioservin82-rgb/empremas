import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

const ESTADOS_VALIDOS = ['internado', 'dado_de_alta'];

// Sin restriccion de sucursal, mismo criterio que Reparaciones: una
// internacion puede durar dias o semanas.
export async function listarInternaciones(req, res) {
    const { empresaId } = req.usuario;
    const estado = req.query.estado || null;
    const q = (req.query.q || '').trim();

    const condiciones = ['1=1'];
    const valores = [];

    if (estado) {
        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }
        valores.push(estado);
        condiciones.push(`i.estado = $${valores.length}`);
    }

    if (q) {
        valores.push(`%${q}%`);
        condiciones.push(`(m.nombre ILIKE $${valores.length} OR cl.nombre ILIKE $${valores.length})`);
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT i.*, m.nombre AS mascota_nombre, m.especie AS mascota_especie,
                cl.nombre AS cliente_nombre, cl.celular AS cliente_celular
         FROM internaciones i
         JOIN mascotas m ON m.id = i.mascota_id
         JOIN clientes cl ON cl.id = m.cliente_id
         WHERE ${condiciones.join(' AND ')}
         ORDER BY i.estado ASC, i.fecha_ingreso DESC
         LIMIT 200`,
        valores
    );

    res.json(resultado.rows);
}

export async function obtenerInternacion(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT i.*, m.nombre AS mascota_nombre, m.especie AS mascota_especie,
                cl.id AS cliente_id, cl.nombre AS cliente_nombre, cl.documento AS cliente_documento,
                cl.celular AS cliente_celular, u.nombre AS usuario_nombre
         FROM internaciones i
         JOIN mascotas m ON m.id = i.mascota_id
         JOIN clientes cl ON cl.id = m.cliente_id
         JOIN usuarios u ON u.id = i.usuario_id
         WHERE i.id = $1`,
        [id]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Internación no encontrada' });
    }

    // Igual que en Reparaciones: una internacion puede cobrarse mas de una
    // vez (ej. un anticipo al ingresar y el saldo al alta) - trazabilidad,
    // sin limite.
    const ventas = await consultaDeEmpresa(
        empresaId,
        `SELECT id, numero_ticket, total, tipo_pago, creado_en FROM ventas WHERE internacion_id = $1 ORDER BY creado_en ASC`,
        [id]
    );

    res.json({ ...resultado.rows[0], ventas: ventas.rows });
}

export async function crearInternacion(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { mascotaId, motivo, tarifaDiaria, notaIngreso } = req.body;

    if (!mascotaId) {
        return res.status(400).json({ error: 'Elegí qué mascota ingresa' });
    }
    if (!motivo || !String(motivo).trim()) {
        return res.status(400).json({ error: 'Indicá el motivo del ingreso (hospedaje, tratamiento, etc.)' });
    }

    try {
        const internacion = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const mascotaResultado = await cliente.query(`SELECT id FROM mascotas WHERE id = $1`, [mascotaId]);
            if (!mascotaResultado.rows[0]) {
                throw new ErrorNegocio('La mascota no existe');
            }

            // Numeracion correlativa, mismo patron que reparaciones/ticket.
            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_internacion = siguiente_numero_internacion + 1
                 WHERE id = $1
                 RETURNING siguiente_numero_internacion - 1 AS numero`,
                [empresaId]
            );
            const numero = numeroResultado.rows[0].numero;

            const insertado = await cliente.query(
                `INSERT INTO internaciones (empresa_id, sucursal_id, mascota_id, numero, motivo, tarifa_diaria, nota_ingreso, usuario_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [empresaId, sucursalId, mascotaId, numero, String(motivo).trim(), tarifaDiaria || null, notaIngreso || null, usuarioId]
            );
            return insertado.rows[0];
        });
        res.status(201).json(internacion);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Dar de alta: se puede volver a "internado" despues (ej. se cargo por
// error) - no es un estado final e irreversible, mismo espiritu flexible
// que los estados de Reparaciones.
export async function actualizarEstadoInternacion(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { estado, notaAlta } = req.body;

    if (!ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        // $2 se usa en dos contextos (asignado a la columna enum, y
        // comparado como texto) - sin el ::text explicito en la comparacion,
        // Postgres deduce tipos inconsistentes para el mismo parametro y
        // rechaza la consulta entera.
        `UPDATE internaciones SET
            estado = $2::estado_internacion,
            fecha_alta = CASE WHEN $2::text = 'dado_de_alta' THEN COALESCE(fecha_alta, now()) ELSE NULL END,
            nota_alta = COALESCE($3, nota_alta)
         WHERE id = $1
         RETURNING *`,
        [id, estado, notaAlta || null]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Internación no encontrada' });
    }
    res.json(resultado.rows[0]);
}
