import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// Baja de stock que no es una venta: consumo interno o merma (ver
// motivo_salida_stock en schema.sql). Mismo esqueleto que
// productosController.ajustarInventario (lock + upsert de producto_stock)
// pero descuenta una cantidad en vez de fijar un valor absoluto, y guarda
// el costo (nunca el precio de venta) como foto de productos.precio_costo
// en el momento del retiro.
export async function registrarSalida(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { productoId, motivo, cantidad, nota } = req.body;

    const MOTIVOS_VALIDOS = ['consumo_interno', 'merma_vencimiento', 'rotura_robo'];
    if (!MOTIVOS_VALIDOS.includes(motivo)) {
        return res.status(400).json({ error: 'Motivo inválido' });
    }
    if (!(Number(cantidad) > 0)) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a cero' });
    }

    try {
        const salida = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const productoResultado = await cliente.query(
                `SELECT nombre, precio_costo FROM productos WHERE id = $1`,
                [productoId]
            );
            const producto = productoResultado.rows[0];
            if (!producto) {
                throw new ErrorNegocio('El producto no existe');
            }

            await cliente.query(
                `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                 VALUES ($1, $2, $3, 0)
                 ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                [empresaId, productoId, sucursalId]
            );

            const stockResultado = await cliente.query(
                `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                [productoId, sucursalId]
            );
            const stockActual = Number(stockResultado.rows[0].stock);
            if (Number(cantidad) > stockActual) {
                throw new ErrorNegocio(`No hay suficiente stock: quedan ${stockActual}`);
            }

            await cliente.query(
                `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                [productoId, sucursalId, cantidad]
            );

            const costoUnitario = Number(producto.precio_costo);
            const salidaInsertada = await cliente.query(
                `INSERT INTO salidas_stock (empresa_id, producto_id, sucursal_id, usuario_id, motivo, cantidad, costo_unitario, nota)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, creado_en, fecha`,
                [empresaId, productoId, sucursalId, usuarioId, motivo, cantidad, costoUnitario, nota || null]
            );

            return {
                id: salidaInsertada.rows[0].id,
                creadoEn: salidaInsertada.rows[0].creado_en,
                fecha: salidaInsertada.rows[0].fecha,
                productoId,
                productoNombre: producto.nombre,
                motivo,
                cantidad: Number(cantidad),
                costoUnitario,
                total: costoUnitario * Number(cantidad),
                stockRestante: stockActual - Number(cantidad),
            };
        });

        res.status(201).json(salida);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function historialSalidas(req, res) {
    const { empresaId } = req.usuario;
    const { productoId, desde, hasta } = req.query;

    const condiciones = [];
    const valores = [];
    if (productoId) {
        valores.push(productoId);
        condiciones.push(`s.producto_id = $${valores.length}`);
    }
    if (desde) {
        valores.push(desde);
        condiciones.push(`s.fecha >= $${valores.length}::date`);
    }
    if (hasta) {
        valores.push(hasta);
        condiciones.push(`s.fecha < ($${valores.length}::date + INTERVAL '1 day')`);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT s.*, p.nombre AS producto_nombre
         FROM salidas_stock s
         JOIN productos p ON p.id = s.producto_id
         ${where}
         ORDER BY s.creado_en DESC LIMIT 200`,
        valores
    );

    res.json(resultado.rows);
}
