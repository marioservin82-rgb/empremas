import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// Pedido de una sucursal a la central ("nos falta esto") - complementa al
// Traslado (trasladosController.js, que sigue funcionando solo sin que
// medie ningún pedido), no lo reemplaza. Nunca toca stock por sí solo -
// solo cuando la central genera un Traslado a partir de él (ver
// crearTraslado con pedidoSucursalId) y ese traslado se confirma.
export async function crearPedidoSucursal(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { items, nota } = req.body;

    if (!sucursalId) {
        return res.status(400).json({ error: 'Tu usuario no tiene una sucursal asignada' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Agregá al menos un producto' });
    }

    try {
        const pedido = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_pedido_sucursal = siguiente_numero_pedido_sucursal + 1
                 WHERE id = $1 RETURNING siguiente_numero_pedido_sucursal - 1 AS numero`,
                [empresaId]
            );
            const numero = numeroResultado.rows[0].numero;

            const pedidoInsertado = await cliente.query(
                `INSERT INTO pedidos_sucursal (empresa_id, numero, sucursal_id, usuario_id, nota)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id, creado_en`,
                [empresaId, numero, sucursalId, usuarioId, nota || null]
            );
            const pedidoId = pedidoInsertado.rows[0].id;

            const itemsConNombre = [];
            for (const item of items) {
                if (!(Number(item.cantidad) > 0)) {
                    throw new ErrorNegocio('Cada producto necesita una cantidad mayor a cero');
                }
                const productoResultado = await cliente.query(
                    `SELECT nombre FROM productos WHERE id = $1 AND empresa_id = $2`,
                    [item.productoId, empresaId]
                );
                if (!productoResultado.rows[0]) {
                    throw new ErrorNegocio('Uno de los productos ya no existe');
                }
                await cliente.query(
                    `INSERT INTO pedido_sucursal_items (empresa_id, pedido_sucursal_id, producto_id, cantidad)
                     VALUES ($1, $2, $3, $4)`,
                    [empresaId, pedidoId, item.productoId, item.cantidad]
                );
                itemsConNombre.push({
                    productoId: item.productoId,
                    nombre: productoResultado.rows[0].nombre,
                    cantidad: Number(item.cantidad),
                });
            }

            return { id: pedidoId, numero, creadoEn: pedidoInsertado.rows[0].creado_en, items: itemsConNombre };
        });

        res.status(201).json(pedido);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

// La central ve TODOS los pedidos pendientes de la empresa (no hay un
// concepto de "sucursal central" fijo en el modelo - es simplemente quien
// tenga el permiso de inventario y esté mirando esta pantalla).
export async function listarPedidosSucursalPendientes(req, res) {
    const { empresaId } = req.usuario;

    const pedidos = await consultaDeEmpresa(
        empresaId,
        `SELECT ps.id, ps.numero, ps.creado_en, ps.nota,
                s.nombre AS sucursal_nombre, s.id AS sucursal_id, u.nombre AS usuario_nombre
         FROM pedidos_sucursal ps
         JOIN sucursales s ON s.id = ps.sucursal_id
         JOIN usuarios u ON u.id = ps.usuario_id
         WHERE ps.estado = 'pendiente'
         ORDER BY ps.creado_en ASC`,
        []
    );

    const ids = pedidos.rows.map((p) => p.id);
    let items = { rows: [] };
    if (ids.length > 0) {
        items = await consultaDeEmpresa(
            empresaId,
            `SELECT psi.pedido_sucursal_id, psi.producto_id, psi.cantidad, p.nombre AS producto_nombre
             FROM pedido_sucursal_items psi JOIN productos p ON p.id = psi.producto_id
             WHERE psi.pedido_sucursal_id = ANY($1::uuid[])`,
            [ids]
        );
    }
    const itemsPorPedido = new Map();
    for (const item of items.rows) {
        if (!itemsPorPedido.has(item.pedido_sucursal_id)) itemsPorPedido.set(item.pedido_sucursal_id, []);
        itemsPorPedido.get(item.pedido_sucursal_id).push(item);
    }

    res.json(pedidos.rows.map((p) => ({ ...p, items: itemsPorPedido.get(p.id) || [] })));
}

// Detalle de un pedido puntual - lo usa la pantalla de "Nuevo traslado"
// cuando se llega ahí desde "Generar traslado desde este pedido", para
// precargar el carrito con lo que la sucursal pidió.
export async function obtenerPedidoSucursal(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const pedidoResultado = await consultaDeEmpresa(
        empresaId,
        `SELECT ps.id, ps.numero, ps.estado, ps.creado_en, ps.sucursal_id, s.nombre AS sucursal_nombre
         FROM pedidos_sucursal ps JOIN sucursales s ON s.id = ps.sucursal_id
         WHERE ps.id = $1`,
        [id]
    );
    const pedido = pedidoResultado.rows[0];
    if (!pedido) return res.status(404).json({ error: 'El pedido no existe' });

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT psi.producto_id, psi.cantidad, p.nombre AS producto_nombre
         FROM pedido_sucursal_items psi JOIN productos p ON p.id = psi.producto_id
         WHERE psi.pedido_sucursal_id = $1`,
        [id]
    );
    res.json({ ...pedido, items: items.rows });
}

// Se usa cuando la central decide resolver el pedido de otra forma (ej.
// compró directo a un proveedor para esa sucursal) sin pasar por un
// Traslado - marca cancelado en vez de dejarlo pendiente para siempre.
export async function cancelarPedidoSucursal(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE pedidos_sucursal SET estado = 'cancelado' WHERE id = $1 AND estado = 'pendiente' RETURNING id`,
        [id]
    );
    if (!resultado.rows[0]) {
        return res.status(400).json({ error: 'Este pedido no existe o ya fue resuelto' });
    }
    res.json({ ok: true });
}
