import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

const LISTAS_PRECIO = ['contado', 'credito', 'mayorista'];

export async function crearPresupuesto(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { clienteId, listaPrecio, vencimiento, items } = req.body;

    if (!LISTAS_PRECIO.includes(listaPrecio)) {
        return res.status(400).json({ error: 'listaPrecio debe ser contado, credito o mayorista' });
    }
    if (!vencimiento) {
        return res.status(400).json({ error: 'El presupuesto necesita una fecha de vencimiento' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El presupuesto necesita al menos un producto' });
    }

    try {
        const presupuesto = await transaccionDeEmpresa(empresaId, async (cliente) => {
            let total = 0;
            const itemsCalculados = [];

            for (const { productoId, cantidad, precioUnitario } of items) {
                if (!(cantidad > 0) || !(precioUnitario >= 0)) {
                    throw new ErrorNegocio('Cada producto necesita una cantidad y un precio válidos');
                }
                const resultado = await cliente.query(`SELECT id FROM productos WHERE id = $1`, [productoId]);
                if (!resultado.rows[0]) {
                    throw new ErrorNegocio('Uno de los productos ya no existe');
                }
                const subtotal = precioUnitario * cantidad;
                total += subtotal;
                itemsCalculados.push({ productoId, cantidad, precioUnitario, subtotal });
            }

            if (clienteId) {
                const clienteResultado = await cliente.query(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
                if (!clienteResultado.rows[0]) {
                    throw new ErrorNegocio('El cliente ya no existe');
                }
            }

            // Número correlativo por empresa (mismo mecanismo que los recibos de
            // cobro): el UPDATE bloquea la fila de la empresa, así dos altas
            // simultáneas nunca sacan el mismo número.
            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_presupuesto = siguiente_numero_presupuesto + 1
                 WHERE id = $1
                 RETURNING siguiente_numero_presupuesto - 1 AS numero`,
                [empresaId]
            );
            const numero = numeroResultado.rows[0].numero;

            const presupuestoInsertado = await cliente.query(
                `INSERT INTO presupuestos (empresa_id, cliente_id, usuario_id, numero, lista_precio, vencimiento, total)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, creado_en`,
                [empresaId, clienteId || null, usuarioId, numero, listaPrecio, vencimiento, total]
            );
            const presupuestoId = presupuestoInsertado.rows[0].id;

            for (const item of itemsCalculados) {
                await cliente.query(
                    `INSERT INTO presupuesto_items (empresa_id, presupuesto_id, producto_id, cantidad, precio_unitario, subtotal)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [empresaId, presupuestoId, item.productoId, item.cantidad, item.precioUnitario, item.subtotal]
                );
            }

            return {
                id: presupuestoId,
                numero,
                creadoEn: presupuestoInsertado.rows[0].creado_en,
                clienteId: clienteId || null,
                listaPrecio,
                vencimiento,
                total,
                items: itemsCalculados,
            };
        });

        res.status(201).json(presupuesto);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Edita un presupuesto ya creado (ej. "agregame tal cosa al mismo
// presupuesto") - reemplaza la lista de items entera, mismo criterio ya
// usado en el resto de la app para un formulario que reenvia todo
// (categorias_cliente, producto_asociaciones...). El numero correlativo y
// quien lo creo no cambian. Las ventas ya generadas antes de editar no se
// tocan - son una foto propia (venta_items), no dependen de
// presupuesto_items en vivo.
export async function actualizarPresupuesto(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { clienteId, listaPrecio, vencimiento, items } = req.body;

    if (!LISTAS_PRECIO.includes(listaPrecio)) {
        return res.status(400).json({ error: 'listaPrecio debe ser contado, credito o mayorista' });
    }
    if (!vencimiento) {
        return res.status(400).json({ error: 'El presupuesto necesita una fecha de vencimiento' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El presupuesto necesita al menos un producto' });
    }

    try {
        await transaccionDeEmpresa(empresaId, async (cliente) => {
            const existente = await cliente.query(`SELECT id FROM presupuestos WHERE id = $1`, [id]);
            if (!existente.rows[0]) {
                throw new ErrorNegocio('Presupuesto no encontrado');
            }

            let total = 0;
            const itemsCalculados = [];
            for (const { productoId, cantidad, precioUnitario } of items) {
                if (!(cantidad > 0) || !(precioUnitario >= 0)) {
                    throw new ErrorNegocio('Cada producto necesita una cantidad y un precio válidos');
                }
                const productoResultado = await cliente.query(`SELECT id FROM productos WHERE id = $1`, [productoId]);
                if (!productoResultado.rows[0]) {
                    throw new ErrorNegocio('Uno de los productos ya no existe');
                }
                const subtotal = precioUnitario * cantidad;
                total += subtotal;
                itemsCalculados.push({ productoId, cantidad, precioUnitario, subtotal });
            }

            if (clienteId) {
                const clienteResultado = await cliente.query(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
                if (!clienteResultado.rows[0]) {
                    throw new ErrorNegocio('El cliente ya no existe');
                }
            }

            await cliente.query(
                `UPDATE presupuestos SET cliente_id = $2, lista_precio = $3, vencimiento = $4, total = $5 WHERE id = $1`,
                [id, clienteId || null, listaPrecio, vencimiento, total]
            );

            await cliente.query(`DELETE FROM presupuesto_items WHERE presupuesto_id = $1`, [id]);
            for (const item of itemsCalculados) {
                await cliente.query(
                    `INSERT INTO presupuesto_items (empresa_id, presupuesto_id, producto_id, cantidad, precio_unitario, subtotal)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [empresaId, id, item.productoId, item.cantidad, item.precioUnitario, item.subtotal]
                );
            }
        });

        // Se devuelve releido con el mismo shape que obtenerPresupuesto, para
        // que la pantalla de edicion pueda redirigir a la de detalle sin
        // tener que rearmar la respuesta a mano.
        await obtenerPresupuesto(req, res);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            const status = error.message === 'Presupuesto no encontrado' ? 404 : 400;
            return res.status(status).json({ error: error.message });
        }
        throw error;
    }
}

export async function listarPresupuestos(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT p.*, c.nombre AS cliente_nombre,
                (p.vencimiento < CURRENT_DATE) AS vencido
         FROM presupuestos p
         LEFT JOIN clientes c ON c.id = p.cliente_id
         ORDER BY p.creado_en DESC LIMIT 200`,
        []
    );

    res.json(resultado.rows);
}

export async function obtenerPresupuesto(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const presupuesto = await consultaDeEmpresa(
        empresaId,
        `SELECT p.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.celular AS cliente_celular,
                c.direccion AS cliente_direccion,
                (p.vencimiento < CURRENT_DATE) AS vencido
         FROM presupuestos p
         LEFT JOIN clientes c ON c.id = p.cliente_id
         WHERE p.id = $1`,
        [id]
    );
    if (!presupuesto.rows[0]) {
        return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT pi.*, pr.nombre AS producto_nombre, pr.unidad_medida
         FROM presupuesto_items pi
         JOIN productos pr ON pr.id = pi.producto_id
         WHERE pi.presupuesto_id = $1`,
        [id]
    );

    const ventasGeneradas = await consultaDeEmpresa(
        empresaId,
        `SELECT id, total, creado_en FROM ventas WHERE presupuesto_id = $1 ORDER BY creado_en DESC`,
        [id]
    );

    res.json({ ...presupuesto.rows[0], items: items.rows, ventasGeneradas: ventasGeneradas.rows });
}
