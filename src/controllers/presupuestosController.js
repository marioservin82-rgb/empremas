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

            const presupuestoInsertado = await cliente.query(
                `INSERT INTO presupuestos (empresa_id, cliente_id, usuario_id, lista_precio, vencimiento, total)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, creado_en`,
                [empresaId, clienteId || null, usuarioId, listaPrecio, vencimiento, total]
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
