import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito'];

// Misma logica que calcularVuelto en ventasController, pero para una
// compra no tiene sentido "vuelto" — si sobra plata en la sumatoria de
// pagos es un error de carga, no un vuelto que nos den a nosotros.
function validarPagos(pagos, total) {
    if (!Array.isArray(pagos) || pagos.length === 0) {
        throw new ErrorNegocio('Elegí cómo se pagó: efectivo, transferencia, tarjeta de crédito o débito');
    }
    let suma = 0;
    for (const p of pagos) {
        if (!FORMAS_PAGO.includes(p.formaPago) || !(Number(p.monto) > 0)) {
            throw new ErrorNegocio('Cada pago necesita una forma de cobro válida y un monto mayor a cero');
        }
        suma += Number(p.monto);
    }
    if (Math.abs(suma - total) > 0.01) {
        throw new ErrorNegocio(`Los pagos (Gs ${suma.toLocaleString('es-PY')}) no coinciden con el total (Gs ${total.toLocaleString('es-PY')})`);
    }
}

export async function crearCompra(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { proveedorId, tipoPago, pagos, items, numeroFactura, timbrado, fechaCompra } = req.body;

    if (!proveedorId) {
        return res.status(400).json({ error: 'La compra necesita un proveedor' });
    }
    if (!['contado', 'credito'].includes(tipoPago)) {
        return res.status(400).json({ error: 'tipoPago debe ser contado o credito' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'La compra necesita al menos un producto' });
    }

    try {
        const compra = await transaccionDeEmpresa(empresaId, async (cliente) => {
            let total = 0;
            const itemsCalculados = [];

            for (const { productoId, cantidad, precioUnitario, precioContado, precioCredito, precioMayorista } of items) {
                if (!(cantidad > 0) || !(precioUnitario >= 0)) {
                    throw new ErrorNegocio('Cada producto necesita una cantidad y un precio de costo válidos');
                }
                const resultado = await cliente.query(
                    `SELECT nombre, precio_costo FROM productos WHERE id = $1 FOR UPDATE`,
                    [productoId]
                );
                if (!resultado.rows[0]) {
                    throw new ErrorNegocio('Uno de los productos ya no existe');
                }
                // Costo promedio ponderado por cantidad, no por cantidad de
                // compras: (stock actual * costo promedio actual + cantidad
                // comprada * costo de esta compra) / (stock actual + cantidad
                // comprada). Si nunca hubo costo cargado (0), se usa directo
                // el costo de esta compra en vez de diluir contra un cero
                // falso - y si el stock actual es 0 la formula ya da eso
                // mismo sola, sin necesitar un caso aparte. El stock es el
                // total de todas las sucursales (mismo criterio que
                // inventarioValorizado): el costo es del producto, no de una
                // sucursal puntual.
                const costoPromedioActual = Number(resultado.rows[0].precio_costo);
                let costoPromedioNuevo = precioUnitario;
                if (costoPromedioActual > 0) {
                    const stockResultado = await cliente.query(
                        `SELECT COALESCE(SUM(stock), 0) AS total FROM producto_stock WHERE producto_id = $1`,
                        [productoId]
                    );
                    const stockActual = Number(stockResultado.rows[0].total);
                    // Si el stock quedo en negativo (se vendio sin stock con
                    // "permitir_venta_sin_stock") y esta compra lo trae de
                    // vuelta a cero o menos, diluir contra ese stock negativo
                    // da division por cero o un promedio sin sentido - en ese
                    // caso el costo de esta compra pasa a ser el nuevo costo
                    // promedio directo, mismo criterio que cuando nunca hubo
                    // costo cargado.
                    costoPromedioNuevo =
                        stockActual + cantidad > 0
                            ? (stockActual * costoPromedioActual + cantidad * precioUnitario) / (stockActual + cantidad)
                            : precioUnitario;
                }
                const subtotal = precioUnitario * cantidad;
                total += subtotal;
                itemsCalculados.push({
                    productoId,
                    cantidad,
                    precioUnitario,
                    costoPromedioNuevo,
                    subtotal,
                    precioContado,
                    precioCredito,
                    precioMayorista,
                });
            }

            if (tipoPago === 'contado') {
                validarPagos(pagos, total);
            }

            const proveedorResultado = await cliente.query(`SELECT id FROM proveedores WHERE id = $1 FOR UPDATE`, [
                proveedorId,
            ]);
            if (!proveedorResultado.rows[0]) {
                throw new ErrorNegocio('El proveedor ya no existe');
            }

            const compraInsertada = await cliente.query(
                `INSERT INTO compras (empresa_id, proveedor_id, usuario_id, sucursal_id, tipo_pago, numero_factura, timbrado, fecha_compra, total)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_DATE), $9)
                 RETURNING id, creado_en, fecha_compra`,
                [empresaId, proveedorId, usuarioId, sucursalId, tipoPago, numeroFactura || null, timbrado || null, fechaCompra || null, total]
            );
            const compraId = compraInsertada.rows[0].id;

            if (tipoPago === 'contado') {
                for (const p of pagos) {
                    await cliente.query(
                        `INSERT INTO compra_pagos (empresa_id, compra_id, forma_pago, monto) VALUES ($1, $2, $3, $4)`,
                        [empresaId, compraId, p.formaPago, p.monto]
                    );
                }
            } else {
                await cliente.query(`UPDATE proveedores SET saldo = saldo + $2 WHERE id = $1`, [proveedorId, total]);
            }

            for (const item of itemsCalculados) {
                await cliente.query(
                    `INSERT INTO compra_items (empresa_id, compra_id, producto_id, cantidad, precio_unitario, subtotal)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [empresaId, compraId, item.productoId, item.cantidad, item.precioUnitario, item.subtotal]
                );
                // La compra aumenta el stock (al reves de una venta, en la
                // sucursal de quien la carga), actualiza el costo al
                // promedio ponderado ya calculado arriba, y de paso permite
                // fijar los 3 precios de venta ahi mismo (si se mandaron)
                // para no tener que ir a Stock a cargarlos por separado.
                await cliente.query(
                    `UPDATE productos SET
                        precio_costo = $2,
                        precio_contado = COALESCE($3, precio_contado),
                        precio_credito = COALESCE($4, precio_credito),
                        precio_mayorista = COALESCE($5, precio_mayorista)
                     WHERE id = $1`,
                    [
                        item.productoId,
                        item.costoPromedioNuevo,
                        item.precioContado,
                        item.precioCredito,
                        item.precioMayorista,
                    ]
                );
                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET stock = producto_stock.stock + $4`,
                    [empresaId, item.productoId, sucursalId, item.cantidad]
                );
            }

            return {
                id: compraId,
                creadoEn: compraInsertada.rows[0].creado_en,
                fechaCompra: compraInsertada.rows[0].fecha_compra,
                proveedorId,
                tipoPago,
                pagos: tipoPago === 'contado' ? pagos : [],
                total,
                items: itemsCalculados,
            };
        });

        res.status(201).json(compra);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function listarCompras(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT c.*, p.nombre AS proveedor_nombre
         FROM compras c
         JOIN proveedores p ON p.id = c.proveedor_id
         ORDER BY c.creado_en DESC LIMIT 100`,
        []
    );

    res.json(resultado.rows);
}

// Detalle de una compra (para verla, editarla o anularla).
export async function obtenerCompra(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const compra = await consultaDeEmpresa(
        empresaId,
        `SELECT c.*, p.nombre AS proveedor_nombre, u.nombre AS usuario_nombre, ua.nombre AS anulada_por_nombre
         FROM compras c
         JOIN proveedores p ON p.id = c.proveedor_id
         LEFT JOIN usuarios u ON u.id = c.usuario_id
         LEFT JOIN usuarios ua ON ua.id = c.anulada_por
         WHERE c.id = $1`,
        [id]
    );
    if (!compra.rows[0]) return res.status(404).json({ error: 'Compra no encontrada' });

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT ci.*, pr.nombre AS producto_nombre
         FROM compra_items ci JOIN productos pr ON pr.id = ci.producto_id
         WHERE ci.compra_id = $1`,
        [id]
    );
    const pagos = await consultaDeEmpresa(
        empresaId,
        `SELECT forma_pago, monto FROM compra_pagos WHERE compra_id = $1`,
        [id]
    );

    res.json({ ...compra.rows[0], items: items.rows, pagos: pagos.rows });
}

// Anula una compra: revierte el stock que sumó y, si era a crédito, el saldo
// que le cargó al proveedor. La fila queda marcada (nunca se borra). NO revierte
// el costo del producto (el promedio ponderado no se puede "deshacer" con
// exactitud; queda el último costo conocido).
export async function anularCompra(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const motivo = String(req.body?.motivo || '').trim();

    if (!motivo) return res.status(400).json({ error: 'Indicá el motivo de la anulación' });

    try {
        await transaccionDeEmpresa(empresaId, async (cliente) => {
            const compraRes = await cliente.query(
                `SELECT id, tipo_pago, total, proveedor_id, sucursal_id, usuario_id, anulada
                 FROM compras WHERE id = $1 FOR UPDATE`,
                [id]
            );
            const compra = compraRes.rows[0];
            if (!compra) throw new ErrorNegocio('Compra no encontrada');
            if (compra.anulada) throw new ErrorNegocio('Esta compra ya está anulada');

            // Sucursal donde entró el stock (las viejas sin sucursal_id: la del
            // usuario que la cargó).
            let sucursalId = compra.sucursal_id;
            if (!sucursalId) {
                const u = await cliente.query(`SELECT sucursal_id FROM usuarios WHERE id = $1`, [compra.usuario_id]);
                sucursalId = u.rows[0]?.sucursal_id;
            }

            const items = await cliente.query(
                `SELECT producto_id, cantidad FROM compra_items WHERE compra_id = $1`,
                [id]
            );
            for (const it of items.rows) {
                await cliente.query(
                    `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                    [it.producto_id, sucursalId, it.cantidad]
                );
            }

            if (compra.tipo_pago === 'credito') {
                await cliente.query(
                    `UPDATE proveedores SET saldo = saldo - $2 WHERE id = $1`,
                    [compra.proveedor_id, compra.total]
                );
            }

            await cliente.query(
                `UPDATE compras
                    SET anulada = true, anulada_en = now(), anulada_por = $2, motivo_anulacion = $3
                  WHERE id = $1`,
                [id, usuarioId, motivo]
            );
        });
        res.json({ ok: true });
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}

// Corrige los datos de una compra ya registrada SIN tocar los ítems: fecha,
// número/timbrado de factura y forma de pago (contado <-> crédito, ajustando
// el saldo del proveedor y los pagos). Para cambiar los productos hay que
// anular y volver a cargar.
export async function editarCompra(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const b = req.body || {};

    try {
        const compra = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actualRes = await cliente.query(
                `SELECT id, tipo_pago, total, proveedor_id, anulada FROM compras WHERE id = $1 FOR UPDATE`,
                [id]
            );
            const actual = actualRes.rows[0];
            if (!actual) throw new ErrorNegocio('Compra no encontrada');
            if (actual.anulada) throw new ErrorNegocio('No se puede editar una compra anulada');

            const nuevoTipo = b.tipoPago !== undefined ? b.tipoPago : actual.tipo_pago;
            if (!['contado', 'credito'].includes(nuevoTipo)) {
                throw new ErrorNegocio('tipoPago debe ser contado o credito');
            }

            // Cambio de forma de pago -> ajustar saldo del proveedor y pagos.
            if (nuevoTipo !== actual.tipo_pago) {
                if (nuevoTipo === 'contado') {
                    validarPagos(b.pagos, Number(actual.total));
                    await cliente.query(`DELETE FROM compra_pagos WHERE compra_id = $1`, [id]);
                    for (const p of b.pagos) {
                        await cliente.query(
                            `INSERT INTO compra_pagos (empresa_id, compra_id, forma_pago, monto) VALUES ($1, $2, $3, $4)`,
                            [empresaId, id, p.formaPago, p.monto]
                        );
                    }
                    // Era crédito: se le saca del saldo lo que se le había cargado.
                    await cliente.query(`UPDATE proveedores SET saldo = saldo - $2 WHERE id = $1`, [actual.proveedor_id, actual.total]);
                } else {
                    // Pasa a crédito: se elimina el detalle de pagos y se carga al saldo.
                    await cliente.query(`DELETE FROM compra_pagos WHERE compra_id = $1`, [id]);
                    await cliente.query(`UPDATE proveedores SET saldo = saldo + $2 WHERE id = $1`, [actual.proveedor_id, actual.total]);
                }
            }

            await cliente.query(
                `UPDATE compras SET
                    tipo_pago = $2,
                    fecha_compra = COALESCE($3, fecha_compra),
                    numero_factura = CASE WHEN $4::boolean THEN $5 ELSE numero_factura END,
                    timbrado       = CASE WHEN $6::boolean THEN $7 ELSE timbrado END
                 WHERE id = $1`,
                [
                    id,
                    nuevoTipo,
                    b.fechaCompra || null,
                    b.numeroFactura !== undefined,
                    b.numeroFactura || null,
                    b.timbrado !== undefined,
                    b.timbrado || null,
                ]
            );

            const r = await cliente.query(`SELECT * FROM compras WHERE id = $1`, [id]);
            return r.rows[0];
        });
        res.json(compra);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        throw error;
    }
}
