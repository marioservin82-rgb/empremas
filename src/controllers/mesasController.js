import { consultaDeEmpresa } from '../config/db.js';

// Lista las mesas de la empresa con su estado actual y, si tiene un
// pedido abierto (no cerrado), un resumen minimo para que /mesas pueda
// mostrar algo util sin tener que pedir el detalle completo de cada una.
export async function listarMesas(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT m.*,
                p.id AS pedido_id, p.cliente_id, c.nombre AS cliente_nombre, p.tipo AS pedido_tipo,
                (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id) AS pedido_cantidad_items
         FROM mesas m
         LEFT JOIN pedidos p ON p.mesa_id = m.id AND p.estado <> 'cerrado' AND m.es_virtual = false
         LEFT JOIN clientes c ON c.id = p.cliente_id
         ORDER BY m.es_virtual ASC, m.nombre ASC`,
        []
    );
    res.json(resultado.rows);
}

export async function crearMesa(req, res) {
    const { empresaId, sucursalId } = req.usuario;
    const { nombre, esVirtual } = req.body;

    if (!nombre?.trim()) {
        return res.status(400).json({ error: 'La mesa necesita un nombre' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO mesas (empresa_id, sucursal_id, nombre, es_virtual) VALUES ($1, $2, $3, $4) RETURNING *`,
        [empresaId, sucursalId, nombre.trim(), !!esVirtual]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function actualizarMesa(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre } = req.body;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE mesas SET nombre = COALESCE($3, nombre) WHERE id = $1 AND empresa_id = $2 RETURNING *`,
        [id, empresaId, nombre]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'La mesa no existe' });
    }
    res.json(resultado.rows[0]);
}
