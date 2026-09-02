import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// Traslado de stock entre sucursales - descuenta el stock de origen al
// CREARLO (mismo criterio que una salida real: la mercadería sale
// físicamente ni bien se prepara/imprime), lo suma a destino recién
// cuando esa sucursal CONFIRMA que lo recibió. Mientras está 'pendiente'
// ese stock no está en ningún lado contable - refleja que está en camino.
export async function crearTraslado(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { sucursalDestinoId, items, nota, pedidoSucursalId } = req.body;

    if (!sucursalId) {
        return res.status(400).json({ error: 'Tu usuario no tiene una sucursal asignada' });
    }
    if (!sucursalDestinoId) {
        return res.status(400).json({ error: 'Elegí a qué sucursal enviarlo' });
    }
    if (sucursalDestinoId === sucursalId) {
        return res.status(400).json({ error: 'La sucursal de destino tiene que ser distinta a la actual' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Agregá al menos un producto' });
    }

    try {
        const traslado = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const destinoResultado = await cliente.query(
                `SELECT id, nombre FROM sucursales WHERE id = $1 AND activa = true`,
                [sucursalDestinoId]
            );
            if (!destinoResultado.rows[0]) {
                throw new ErrorNegocio('La sucursal de destino no existe o está desactivada');
            }

            // Bloquea la fila de la empresa para la numeración correlativa,
            // mismo patrón que numero_ticket/numero_recibo.
            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_traslado = siguiente_numero_traslado + 1
                 WHERE id = $1 RETURNING siguiente_numero_traslado - 1 AS numero`,
                [empresaId]
            );
            const numero = numeroResultado.rows[0].numero;

            const trasladoInsertado = await cliente.query(
                `INSERT INTO traslados_stock
                    (empresa_id, numero, sucursal_origen_id, sucursal_destino_id, usuario_envia_id, nota, pedido_sucursal_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, creado_en`,
                [empresaId, numero, sucursalId, sucursalDestinoId, usuarioId, nota || null, pedidoSucursalId || null]
            );
            const trasladoId = trasladoInsertado.rows[0].id;

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

                // FOR UPDATE: mismo candado que ajustarInventario/crearVenta,
                // para que dos traslados simultáneos del mismo producto no
                // descuenten sobre un stock ya desactualizado.
                const stockResultado = await cliente.query(
                    `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                    [item.productoId, sucursalId]
                );
                const stockActual = Number(stockResultado.rows[0]?.stock || 0);
                if (stockActual < Number(item.cantidad)) {
                    throw new ErrorNegocio(
                        `No hay suficiente stock de "${productoResultado.rows[0].nombre}" en esta sucursal (hay ${stockActual})`
                    );
                }

                await cliente.query(
                    `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                    [item.productoId, sucursalId, item.cantidad]
                );
                await cliente.query(
                    `INSERT INTO traslado_items (empresa_id, traslado_id, producto_id, cantidad) VALUES ($1, $2, $3, $4)`,
                    [empresaId, trasladoId, item.productoId, item.cantidad]
                );
                itemsConNombre.push({
                    productoId: item.productoId,
                    nombre: productoResultado.rows[0].nombre,
                    cantidad: Number(item.cantidad),
                });
            }

            return {
                id: trasladoId,
                numero,
                creadoEn: trasladoInsertado.rows[0].creado_en,
                sucursalDestinoNombre: destinoResultado.rows[0].nombre,
                items: itemsConNombre,
            };
        });

        res.status(201).json(traslado);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

// Traslados que esta sucursal (la del usuario logueado - o la que el
// dueño eligió en el selector transversal, ver middleware/autenticar.js)
// tiene esperando confirmación.
export async function listarTrasladosPendientes(req, res) {
    const { empresaId, sucursalId } = req.usuario;
    if (!sucursalId) return res.json([]);

    const traslados = await consultaDeEmpresa(
        empresaId,
        `SELECT t.id, t.numero, t.creado_en, t.nota,
                so.nombre AS sucursal_origen_nombre, u.nombre AS usuario_envia_nombre
         FROM traslados_stock t
         JOIN sucursales so ON so.id = t.sucursal_origen_id
         JOIN usuarios u ON u.id = t.usuario_envia_id
         WHERE t.sucursal_destino_id = $1 AND t.estado = 'pendiente'
         ORDER BY t.creado_en ASC`,
        [sucursalId]
    );

    const ids = traslados.rows.map((t) => t.id);
    let items = { rows: [] };
    if (ids.length > 0) {
        items = await consultaDeEmpresa(
            empresaId,
            `SELECT ti.traslado_id, ti.producto_id, ti.cantidad, p.nombre AS producto_nombre
             FROM traslado_items ti JOIN productos p ON p.id = ti.producto_id
             WHERE ti.traslado_id = ANY($1::uuid[])`,
            [ids]
        );
    }
    const itemsPorTraslado = new Map();
    for (const item of items.rows) {
        if (!itemsPorTraslado.has(item.traslado_id)) itemsPorTraslado.set(item.traslado_id, []);
        itemsPorTraslado.get(item.traslado_id).push(item);
    }

    res.json(traslados.rows.map((t) => ({ ...t, items: itemsPorTraslado.get(t.id) || [] })));
}

// Historial de traslados de esta sucursal (enviados o recibidos, en
// cualquier estado) - para revisar qué se movió, no solo lo pendiente.
export async function listarTraslados(req, res) {
    const { empresaId, sucursalId } = req.usuario;
    if (!sucursalId) return res.json([]);

    const traslados = await consultaDeEmpresa(
        empresaId,
        `SELECT t.id, t.numero, t.estado, t.creado_en, t.confirmado_en,
                so.nombre AS sucursal_origen_nombre, sd.nombre AS sucursal_destino_nombre,
                ue.nombre AS usuario_envia_nombre, uc.nombre AS usuario_confirma_nombre
         FROM traslados_stock t
         JOIN sucursales so ON so.id = t.sucursal_origen_id
         JOIN sucursales sd ON sd.id = t.sucursal_destino_id
         JOIN usuarios ue ON ue.id = t.usuario_envia_id
         LEFT JOIN usuarios uc ON uc.id = t.usuario_confirma_id
         WHERE t.sucursal_origen_id = $1 OR t.sucursal_destino_id = $1
         ORDER BY t.creado_en DESC LIMIT 100`,
        [sucursalId]
    );
    res.json(traslados.rows);
}

// La sucursal destino confirma que recibió la mercadería - recién acá se
// suma el stock. Cualquier rol logueado de esa sucursal puede confirmar
// (es solo "firmar que llegó", no una decisión de inventario) - a
// diferencia de crearTraslado/cancelarTraslado, gateados más estricto en
// las rutas.
export async function confirmarTraslado(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { id } = req.params;

    try {
        await transaccionDeEmpresa(empresaId, async (cliente) => {
            const trasladoResultado = await cliente.query(
                `SELECT id, estado, sucursal_destino_id, pedido_sucursal_id FROM traslados_stock WHERE id = $1 FOR UPDATE`,
                [id]
            );
            const traslado = trasladoResultado.rows[0];
            if (!traslado) throw new ErrorNegocio('El traslado no existe');
            if (traslado.sucursal_destino_id !== sucursalId) {
                throw new ErrorNegocio('Este traslado no es para tu sucursal');
            }
            if (traslado.estado !== 'pendiente') {
                throw new ErrorNegocio('Este traslado ya fue resuelto');
            }

            const itemsResultado = await cliente.query(
                `SELECT producto_id, cantidad FROM traslado_items WHERE traslado_id = $1`,
                [id]
            );
            for (const item of itemsResultado.rows) {
                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET stock = producto_stock.stock + $4`,
                    [empresaId, item.producto_id, sucursalId, item.cantidad]
                );
            }

            await cliente.query(
                `UPDATE traslados_stock SET estado = 'confirmado', usuario_confirma_id = $2, confirmado_en = now() WHERE id = $1`,
                [id, usuarioId]
            );

            // El pedido que originó este traslado (si vino de uno) recién
            // queda atendido cuando la mercadería de verdad llegó - no
            // cuando se armó el traslado.
            if (traslado.pedido_sucursal_id) {
                await cliente.query(
                    `UPDATE pedidos_sucursal SET estado = 'atendido', atendido_en = now() WHERE id = $1`,
                    [traslado.pedido_sucursal_id]
                );
            }
        });
        res.json({ ok: true });
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

// Cancela un traslado todavía pendiente y devuelve el stock a origen -
// para corregir uno cargado mal antes de que la otra sucursal lo confirme.
export async function cancelarTraslado(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    try {
        await transaccionDeEmpresa(empresaId, async (cliente) => {
            const trasladoResultado = await cliente.query(
                `SELECT id, estado, sucursal_origen_id FROM traslados_stock WHERE id = $1 FOR UPDATE`,
                [id]
            );
            const traslado = trasladoResultado.rows[0];
            if (!traslado) throw new ErrorNegocio('El traslado no existe');
            if (traslado.estado !== 'pendiente') {
                throw new ErrorNegocio('Este traslado ya fue resuelto');
            }

            const itemsResultado = await cliente.query(
                `SELECT producto_id, cantidad FROM traslado_items WHERE traslado_id = $1`,
                [id]
            );
            for (const item of itemsResultado.rows) {
                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET stock = producto_stock.stock + $4`,
                    [empresaId, item.producto_id, traslado.sucursal_origen_id, item.cantidad]
                );
            }

            await cliente.query(`UPDATE traslados_stock SET estado = 'cancelado' WHERE id = $1`, [id]);
        });
        res.json({ ok: true });
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}
