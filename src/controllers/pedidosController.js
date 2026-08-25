import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { turnoCompartidoDeSucursal } from './turnosController.js';
import { calcularVuelto } from './ventasController.js';

// Crea un pedido nuevo: siempre empieza por el cliente (obligatorio, a
// diferencia de Vender donde es opcional) y siempre vende contra el turno
// ya abierto de la sucursal (el mesero nunca abre turno propio, ver
// turnoCompartidoDeSucursal).
export async function crearPedido(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { mesaId, clienteId, tipo, direccionEntrega } = req.body;

    if (!clienteId) {
        return res.status(400).json({ error: 'Elegí primero un cliente para el pedido' });
    }
    if (!['mesa', 'llevar', 'delivery'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo de pedido inválido' });
    }

    try {
        const pedido = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const mesaResultado = await cliente.query(`SELECT * FROM mesas WHERE id = $1 FOR UPDATE`, [mesaId]);
            const mesa = mesaResultado.rows[0];
            if (!mesa) {
                throw new ErrorNegocio('Esa mesa no existe');
            }
            // Una mesa virtual (para llevar/delivery) es un balde
            // compartido para varios pedidos simultaneos - nunca se marca
            // ocupada ni exige estar libre, a diferencia de una mesa fisica.
            if (!mesa.es_virtual && mesa.estado !== 'libre') {
                throw new ErrorNegocio('Esa mesa ya tiene un pedido abierto');
            }

            const clienteResultado = await cliente.query(`SELECT id, direccion FROM clientes WHERE id = $1`, [clienteId]);
            if (!clienteResultado.rows[0]) {
                throw new ErrorNegocio('El cliente ya no existe');
            }

            const turnoId = await turnoCompartidoDeSucursal(cliente, mesa.sucursal_id);
            if (!turnoId) {
                throw new ErrorNegocio('Todavía no se abrió la caja de este local');
            }

            const direccionFinal =
                tipo === 'delivery' ? direccionEntrega?.trim() || clienteResultado.rows[0].direccion || null : null;

            const insertado = await cliente.query(
                `INSERT INTO pedidos (empresa_id, mesa_id, sucursal_id, cliente_id, usuario_id, turno_id, tipo, direccion_entrega, estado_entrega)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [empresaId, mesaId, mesa.sucursal_id, clienteId, usuarioId, turnoId, tipo, direccionFinal, tipo === 'delivery' ? 'preparando' : null]
            );

            if (!mesa.es_virtual) {
                await cliente.query(`UPDATE mesas SET estado = 'ocupada' WHERE id = $1`, [mesaId]);
            }

            return insertado.rows[0];
        });

        res.status(201).json(pedido);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function obtenerPedido(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const pedidoResultado = await consultaDeEmpresa(
        empresaId,
        `SELECT p.*, m.nombre AS mesa_nombre, c.nombre AS cliente_nombre, c.direccion AS cliente_direccion,
                u.nombre AS mesero_nombre
         FROM pedidos p
         JOIN mesas m ON m.id = p.mesa_id
         JOIN clientes c ON c.id = p.cliente_id
         JOIN usuarios u ON u.id = p.usuario_id
         WHERE p.id = $1`,
        [id]
    );
    const pedido = pedidoResultado.rows[0];
    if (!pedido) {
        return res.status(404).json({ error: 'El pedido no existe' });
    }

    const itemsResultado = await consultaDeEmpresa(
        empresaId,
        `SELECT pi.*, pr.nombre AS producto_nombre, pr.unidad_medida
         FROM pedido_items pi
         JOIN productos pr ON pr.id = pi.producto_id
         WHERE pi.pedido_id = $1
         ORDER BY pi.creado_en ASC`,
        [id]
    );

    res.json({ ...pedido, items: itemsResultado.rows });
}

// Confirma un item del pedido: descuenta stock de inmediato (no al cerrar
// la cuenta) y lo manda a la comanda de cocina. Replica el mismo chequeo
// de stock (incluido el manejo de producto compuesto) que ya usa y prueba
// crearVenta, a proposito NO extraido a un helper compartido - evita
// tocar una vez mas esa funcion critica de plata sin necesidad real (ver
// Contexto del plan).
export async function agregarItem(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { productoId, cantidad, nota } = req.body;

    if (!(Number(cantidad) > 0)) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a cero' });
    }

    try {
        const item = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const pedidoResultado = await cliente.query(`SELECT * FROM pedidos WHERE id = $1 FOR UPDATE`, [id]);
            const pedido = pedidoResultado.rows[0];
            if (!pedido) {
                throw new ErrorNegocio('El pedido no existe');
            }
            if (pedido.estado === 'cerrado') {
                throw new ErrorNegocio('Esta cuenta ya está cerrada');
            }

            const empresaResultado = await cliente.query(`SELECT permitir_venta_sin_stock FROM empresas WHERE id = $1`, [
                empresaId,
            ]);
            const permitirVentaSinStock = empresaResultado.rows[0]?.permitir_venta_sin_stock ?? false;

            const productoResultado = await cliente.query(
                `SELECT nombre, es_compuesto, precio_contado FROM productos WHERE id = $1 AND activo = true`,
                [productoId]
            );
            const producto = productoResultado.rows[0];
            if (!producto) {
                throw new ErrorNegocio('Ese producto ya no existe');
            }

            if (producto.es_compuesto) {
                const recetaResultado = await cliente.query(
                    `SELECT insumo_id, cantidad FROM producto_receta_items WHERE producto_id = $1`,
                    [productoId]
                );
                for (const recetaItem of recetaResultado.rows) {
                    const cantidadNecesaria = Number(recetaItem.cantidad) * Number(cantidad);
                    await cliente.query(
                        `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                         VALUES ($1, $2, $3, 0)
                         ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                        [empresaId, recetaItem.insumo_id, pedido.sucursal_id]
                    );
                    const stockInsumoResultado = await cliente.query(
                        `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                        [recetaItem.insumo_id, pedido.sucursal_id]
                    );
                    const stockInsumoActual = Number(stockInsumoResultado.rows[0].stock);
                    if (!permitirVentaSinStock && stockInsumoActual < cantidadNecesaria) {
                        throw new ErrorNegocio(`No hay suficiente stock de un ingrediente de "${producto.nombre}"`);
                    }
                    await cliente.query(
                        `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                        [recetaItem.insumo_id, pedido.sucursal_id, cantidadNecesaria]
                    );
                }
            } else {
                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, 0)
                     ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                    [empresaId, productoId, pedido.sucursal_id]
                );
                const stockResultado = await cliente.query(
                    `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                    [productoId, pedido.sucursal_id]
                );
                const stockActual = Number(stockResultado.rows[0].stock);
                if (!permitirVentaSinStock && stockActual < Number(cantidad)) {
                    throw new ErrorNegocio(`No hay suficiente stock de "${producto.nombre}"`);
                }
                await cliente.query(
                    `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                    [productoId, pedido.sucursal_id, cantidad]
                );
            }

            const insertado = await cliente.query(
                `INSERT INTO pedido_items (empresa_id, pedido_id, producto_id, cantidad, nota, precio_unitario)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [empresaId, id, productoId, cantidad, nota?.trim() || null, producto.precio_contado]
            );
            return { ...insertado.rows[0], producto_nombre: producto.nombre };
        });

        res.status(201).json(item);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function marcarItemListo(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { estadoCocina } = req.body;

    if (!['pendiente', 'listo'].includes(estadoCocina)) {
        return res.status(400).json({ error: 'Estado de cocina inválido' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE pedido_items SET estado_cocina = $2 WHERE id = $1 RETURNING *`,
        [id, estadoCocina]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'El ítem no existe' });
    }
    res.json(resultado.rows[0]);
}

// Comanda de cocina: todos los items pendientes de la empresa, del mas
// viejo al mas nuevo. Sin filtro de rol mas alla de estar logueado - la
// tablet de cocina puede quedar con cualquier sesion activa.
export async function comanda(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT pi.id, pi.cantidad, pi.nota, pi.creado_en, pr.nombre AS producto_nombre,
                m.nombre AS mesa_nombre, p.id AS pedido_id
         FROM pedido_items pi
         JOIN pedidos p ON p.id = pi.pedido_id
         JOIN mesas m ON m.id = p.mesa_id
         JOIN productos pr ON pr.id = pi.producto_id
         WHERE pi.empresa_id = $1 AND pi.estado_cocina = 'pendiente'
         ORDER BY pi.creado_en ASC`,
        [empresaId]
    );
    res.json(resultado.rows);
}

// Cambios de estado del pedido en si (pedir la cuenta / estado de
// entrega de un delivery) - un solo PATCH liviano, sin tocar items ni caja.
export async function actualizarPedido(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { estado, estadoEntrega } = req.body;

    if (estado !== undefined && !['abierto', 'cuenta_pedida'].includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    if (estadoEntrega !== undefined && !['preparando', 'en_camino', 'entregado'].includes(estadoEntrega)) {
        return res.status(400).json({ error: 'Estado de entrega inválido' });
    }

    const resultado = await transaccionDeEmpresa(empresaId, async (cliente) => {
        const pedidoResultado = await cliente.query(
            `UPDATE pedidos SET
                estado = COALESCE($2, estado),
                estado_entrega = COALESCE($3, estado_entrega)
             WHERE id = $1 AND estado <> 'cerrado'
             RETURNING *`,
            [id, estado, estadoEntrega]
        );
        const pedido = pedidoResultado.rows[0];
        if (pedido && estado === 'cuenta_pedida') {
            await cliente.query(`UPDATE mesas SET estado = 'cuenta_pedida' WHERE id = $1 AND es_virtual = false`, [
                pedido.mesa_id,
            ]);
        }
        return pedido;
    });

    if (!resultado) {
        return res.status(404).json({ error: 'El pedido no existe o ya está cerrado' });
    }
    res.json(resultado);
}

// Cierra la cuenta de un pedido: arma la venta ENTERAMENTE con lo que ya
// esta guardado en pedido_items (precio y cantidad ya congelados) - nunca
// confia en nada que mande el cliente HTTP en este momento, y no pasa por
// crearVenta (el stock ya se descontó al confirmar cada item, ver
// agregarItem - repetir el descuento aca lo duplicaria).
export async function cerrarCuentaPedido(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const { tipoComprobante, pagos } = req.body;
    const comprobante = ['ticket_comun', 'a4', 'sin_comprobante'].includes(tipoComprobante) ? tipoComprobante : 'ticket_comun';

    try {
        const venta = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const pedidoResultado = await cliente.query(`SELECT * FROM pedidos WHERE id = $1 FOR UPDATE`, [id]);
            const pedido = pedidoResultado.rows[0];
            if (!pedido) {
                throw new ErrorNegocio('El pedido no existe');
            }
            if (pedido.estado === 'cerrado') {
                throw new ErrorNegocio('Esta cuenta ya está cerrada');
            }

            const itemsResultado = await cliente.query(
                `SELECT pi.producto_id, pi.cantidad, pi.precio_unitario, pr.nombre, pr.tasa_iva, pr.precio_costo
                 FROM pedido_items pi JOIN productos pr ON pr.id = pi.producto_id
                 WHERE pi.pedido_id = $1`,
                [id]
            );
            if (itemsResultado.rows.length === 0) {
                throw new ErrorNegocio('El pedido no tiene ningún ítem cargado todavía');
            }

            const total = itemsResultado.rows.reduce(
                (acumulado, item) => acumulado + Number(item.precio_unitario) * Number(item.cantidad),
                0
            );
            const vuelto = calcularVuelto(pagos, total);

            // El mesero que tomo el pedido es tambien su vendedor (ver
            // usuariosController.crearUsuario) - la comision de esta venta
            // se le atribuye a el, mismo calculo que ya usa crearVenta.
            const empresaResultado = await cliente.query(`SELECT comisiones_habilitadas FROM empresas WHERE id = $1`, [
                empresaId,
            ]);
            let vendedorId = null;
            let datosVendedor = null;
            let mapaComisionFija = new Map();
            if (empresaResultado.rows[0]?.comisiones_habilitadas) {
                const vendedorResultado = await cliente.query(
                    `SELECT id, tipo_comision, valor_comision FROM vendedores WHERE usuario_id = $1 AND activo = true`,
                    [pedido.usuario_id]
                );
                if (vendedorResultado.rows[0]) {
                    vendedorId = vendedorResultado.rows[0].id;
                    datosVendedor = vendedorResultado.rows[0];
                    const fijos = await cliente.query(
                        `SELECT producto_id, monto FROM productos_comision_fija WHERE empresa_id = $1`,
                        [empresaId]
                    );
                    mapaComisionFija = new Map(fijos.rows.map((f) => [f.producto_id, Number(f.monto)]));
                }
            }

            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_ticket = siguiente_numero_ticket + 1
                 WHERE id = $1
                 RETURNING siguiente_numero_ticket - 1 AS numero`,
                [empresaId]
            );
            const numeroTicket = numeroResultado.rows[0].numero;

            const ventaInsertada = await cliente.query(
                `INSERT INTO ventas (empresa_id, cliente_id, usuario_id, turno_id, sucursal_id, numero_ticket, tipo_pago, vuelto, total, saldo_pendiente, tipo_comprobante, pedido_id, vendedor_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'contado', $7, $8, 0, $9, $10, $11)
                 RETURNING id, creado_en`,
                [
                    empresaId,
                    pedido.cliente_id,
                    usuarioId,
                    pedido.turno_id,
                    pedido.sucursal_id,
                    numeroTicket,
                    vuelto,
                    total,
                    comprobante,
                    id,
                    vendedorId,
                ]
            );
            const ventaId = ventaInsertada.rows[0].id;

            for (const p of pagos || []) {
                await cliente.query(
                    `INSERT INTO venta_pagos (empresa_id, venta_id, forma_pago, monto) VALUES ($1, $2, $3, $4)`,
                    [empresaId, ventaId, p.formaPago, p.monto]
                );
            }

            for (const item of itemsResultado.rows) {
                const subtotal = Number(item.precio_unitario) * Number(item.cantidad);
                let comisionMonto = 0;
                if (vendedorId) {
                    const fija = mapaComisionFija.get(item.producto_id);
                    comisionMonto =
                        fija != null
                            ? fija * Number(item.cantidad)
                            : datosVendedor.tipo_comision === 'porcentaje'
                            ? subtotal * (Number(datosVendedor.valor_comision) / 100)
                            : Number(datosVendedor.valor_comision) * Number(item.cantidad);
                }
                await cliente.query(
                    `INSERT INTO venta_items (empresa_id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, comision_monto)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [empresaId, ventaId, item.producto_id, item.cantidad, item.precio_unitario, subtotal, item.precio_costo, comisionMonto]
                );
            }

            await cliente.query(
                `UPDATE pedidos SET estado = 'cerrado', venta_id = $2, cerrado_en = now() WHERE id = $1`,
                [id, ventaId]
            );
            await cliente.query(`UPDATE mesas SET estado = 'libre' WHERE id = $1 AND es_virtual = false`, [pedido.mesa_id]);

            return { id: ventaId, total, vuelto, numeroTicket, creadoEn: ventaInsertada.rows[0].creado_en };
        });

        res.status(201).json(venta);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}
