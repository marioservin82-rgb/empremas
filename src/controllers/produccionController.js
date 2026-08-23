import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// ---------------------------------------------------------------------
// Lineas de produccion
// ---------------------------------------------------------------------

export async function listarLineas(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM lineas_produccion WHERE empresa_id = $1 ORDER BY nombre ASC`,
        [empresaId]
    );
    res.json(resultado.rows);
}

export async function crearLinea(req, res) {
    const { empresaId } = req.usuario;
    const { nombre, cantidadReferencia, unidadReferencia } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (cantidadReferencia !== undefined && !(Number(cantidadReferencia) > 0)) {
        return res.status(400).json({ error: 'La cantidad de referencia debe ser mayor a 0' });
    }

    try {
        const resultado = await consultaDeEmpresa(
            empresaId,
            `INSERT INTO lineas_produccion (empresa_id, nombre, cantidad_referencia, unidad_referencia)
             VALUES ($1, $2, COALESCE($3, 1::numeric), COALESCE($4, 'unidad'))
             RETURNING *`,
            [empresaId, nombre.trim(), cantidadReferencia, unidadReferencia]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ya existe una línea de producción con ese nombre' });
        }
        throw error;
    }
}

export async function actualizarLinea(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, cantidadReferencia, unidadReferencia, activa } = req.body;

    if (cantidadReferencia !== undefined && cantidadReferencia !== null && !(Number(cantidadReferencia) > 0)) {
        return res.status(400).json({ error: 'La cantidad de referencia debe ser mayor a 0' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE lineas_produccion SET
            nombre = COALESCE($3, nombre),
            cantidad_referencia = COALESCE($4, cantidad_referencia),
            unidad_referencia = COALESCE($5, unidad_referencia),
            activa = COALESCE($6, activa)
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [id, empresaId, nombre, cantidadReferencia, unidadReferencia, activa]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Línea de producción no encontrada' });
    }
    res.json(resultado.rows[0]);
}

export async function obtenerLinea(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const linea = await consultaDeEmpresa(empresaId, `SELECT * FROM lineas_produccion WHERE id = $1`, [id]);
    if (!linea.rows[0]) {
        return res.status(404).json({ error: 'Línea de producción no encontrada' });
    }

    const receta = await consultaDeEmpresa(
        empresaId,
        `SELECT ri.id, ri.insumo_id, ri.cantidad, p.nombre AS insumo_nombre, p.unidad_medida
         FROM receta_items ri JOIN productos p ON p.id = ri.insumo_id
         WHERE ri.linea_produccion_id = $1 ORDER BY p.nombre ASC`,
        [id]
    );

    const categorias = await consultaDeEmpresa(
        empresaId,
        `SELECT cc.id, cc.nombre, cc.producto_id, cc.orden, cc.activa, p.nombre AS producto_nombre
         FROM categorias_calidad cc LEFT JOIN productos p ON p.id = cc.producto_id
         WHERE cc.linea_produccion_id = $1 ORDER BY cc.orden ASC, cc.nombre ASC`,
        [id]
    );

    res.json({ linea: linea.rows[0], receta: receta.rows, categorias: categorias.rows });
}

// ---------------------------------------------------------------------
// Receta
// ---------------------------------------------------------------------

export async function agregarRecetaItem(req, res) {
    const { empresaId } = req.usuario;
    const { id: lineaId } = req.params;
    const { insumoId, cantidad } = req.body;

    if (!insumoId || !(Number(cantidad) > 0)) {
        return res.status(400).json({ error: 'Elegí un insumo y una cantidad mayor a 0' });
    }

    const insumo = await consultaDeEmpresa(
        empresaId,
        `SELECT id FROM productos WHERE id = $1 AND es_insumo = true AND activo = true`,
        [insumoId]
    );
    if (!insumo.rows[0]) {
        return res.status(400).json({ error: 'El producto elegido no está marcado como insumo de producción' });
    }

    try {
        const resultado = await consultaDeEmpresa(
            empresaId,
            `INSERT INTO receta_items (empresa_id, linea_produccion_id, insumo_id, cantidad)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (linea_produccion_id, insumo_id) DO UPDATE SET cantidad = $4
             RETURNING *`,
            [empresaId, lineaId, insumoId, cantidad]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        if (error.code === '23503') {
            return res.status(404).json({ error: 'La línea de producción no existe' });
        }
        throw error;
    }
}

export async function quitarRecetaItem(req, res) {
    const { empresaId } = req.usuario;
    const { itemId } = req.params;
    await consultaDeEmpresa(empresaId, `DELETE FROM receta_items WHERE id = $1`, [itemId]);
    res.json({ ok: true });
}

// ---------------------------------------------------------------------
// Categorias de calidad
// ---------------------------------------------------------------------

export async function crearCategoriaCalidad(req, res) {
    const { empresaId } = req.usuario;
    const { id: lineaId } = req.params;
    const { nombre, productoId, orden } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (productoId) {
        const producto = await consultaDeEmpresa(
            empresaId,
            `SELECT id FROM productos WHERE id = $1 AND es_insumo = false AND activo = true`,
            [productoId]
        );
        if (!producto.rows[0]) {
            return res.status(400).json({ error: 'El producto elegido no existe o es un insumo, no un producto vendible' });
        }
    }

    try {
        const resultado = await consultaDeEmpresa(
            empresaId,
            `INSERT INTO categorias_calidad (empresa_id, linea_produccion_id, nombre, producto_id, orden)
             VALUES ($1, $2, $3, $4, COALESCE($5, 0))
             RETURNING *`,
            [empresaId, lineaId, nombre.trim(), productoId || null, orden]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ya existe una categoría de calidad con ese nombre en esta línea' });
        }
        throw error;
    }
}

export async function actualizarCategoriaCalidad(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, productoId, orden, activa } = req.body;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE categorias_calidad SET
            nombre = COALESCE($3, nombre),
            producto_id = COALESCE($4, producto_id),
            orden = COALESCE($5, orden),
            activa = COALESCE($6, activa)
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [id, empresaId, nombre, productoId, orden, activa]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Categoría de calidad no encontrada' });
    }
    res.json(resultado.rows[0]);
}

// ---------------------------------------------------------------------
// Ordenes de produccion
// ---------------------------------------------------------------------

export async function listarOrdenes(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT o.*, l.nombre AS linea_nombre
         FROM ordenes_produccion o JOIN lineas_produccion l ON l.id = o.linea_produccion_id
         ORDER BY o.creado_en DESC LIMIT 200`,
        []
    );
    res.json(resultado.rows);
}

export async function obtenerOrden(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const orden = await consultaDeEmpresa(
        empresaId,
        `SELECT o.*, l.nombre AS linea_nombre, l.cantidad_referencia
         FROM ordenes_produccion o JOIN lineas_produccion l ON l.id = o.linea_produccion_id
         WHERE o.id = $1`,
        [id]
    );
    if (!orden.rows[0]) {
        return res.status(404).json({ error: 'Orden de producción no encontrada' });
    }

    const insumosConsumidos = await consultaDeEmpresa(
        empresaId,
        `SELECT ri.insumo_id, p.nombre AS insumo_nombre, p.unidad_medida,
                ri.cantidad * ($2::numeric / l.cantidad_referencia) AS cantidad_consumida
         FROM receta_items ri
         JOIN productos p ON p.id = ri.insumo_id
         JOIN lineas_produccion l ON l.id = ri.linea_produccion_id
         WHERE ri.linea_produccion_id = $1`,
        [orden.rows[0].linea_produccion_id, orden.rows[0].cantidad_producida]
    );

    const categorias = await consultaDeEmpresa(
        empresaId,
        `SELECT cc.id, cc.nombre, cc.producto_id, p.nombre AS producto_nombre
         FROM categorias_calidad cc LEFT JOIN productos p ON p.id = cc.producto_id
         WHERE cc.linea_produccion_id = $1 AND cc.activa = true
         ORDER BY cc.orden ASC, cc.nombre ASC`,
        [orden.rows[0].linea_produccion_id]
    );

    const clasificacion = await consultaDeEmpresa(
        empresaId,
        `SELECT opc.categoria_calidad_id, opc.cantidad, cc.nombre AS categoria_nombre
         FROM orden_produccion_clasificacion opc JOIN categorias_calidad cc ON cc.id = opc.categoria_calidad_id
         WHERE opc.orden_produccion_id = $1`,
        [id]
    );

    res.json({
        orden: orden.rows[0],
        insumosConsumidos: insumosConsumidos.rows,
        categoriasDisponibles: categorias.rows,
        clasificacion: clasificacion.rows,
    });
}

// Al cargar una orden: descuenta insumos segun receta * cantidad
// producida, y congela el costo total consumido (costo_insumos) -
// mismo espiritu que venta_items.costo_unitario, una foto que no se
// mueve despues aunque el costo promedio del insumo siga cambiando.
export async function crearOrden(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { lineaProduccionId, cantidadProducida } = req.body;

    if (!lineaProduccionId || !(Number(cantidadProducida) > 0)) {
        return res.status(400).json({ error: 'Elegí una línea de producción y una cantidad producida mayor a 0' });
    }

    try {
        const orden = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const lineaResultado = await cliente.query(
                `SELECT nombre, cantidad_referencia FROM lineas_produccion WHERE id = $1 AND activa = true`,
                [lineaProduccionId]
            );
            const linea = lineaResultado.rows[0];
            if (!linea) {
                throw new ErrorNegocio('La línea de producción no existe o está inactiva');
            }

            const recetaResultado = await cliente.query(
                `SELECT ri.insumo_id, ri.cantidad, p.nombre AS insumo_nombre
                 FROM receta_items ri JOIN productos p ON p.id = ri.insumo_id
                 WHERE ri.linea_produccion_id = $1`,
                [lineaProduccionId]
            );
            if (recetaResultado.rows.length === 0) {
                throw new ErrorNegocio('Esta línea todavía no tiene receta cargada');
            }

            const factor = Number(cantidadProducida) / Number(linea.cantidad_referencia);
            let costoInsumos = 0;

            for (const item of recetaResultado.rows) {
                const cantidadConsumida = Number(item.cantidad) * factor;

                // El costo (promedio ponderado) es de la empresa entera,
                // pero el consumo fisico de insumos pasa en la sucursal
                // puntual donde se produce - mismo criterio de stock
                // per-sucursal que ya usa crearVenta, no el total sumado
                // entre sucursales (no se puede consumir insumo que esta
                // fisicamente guardado en otro local).
                const productoResultado = await cliente.query(`SELECT precio_costo FROM productos WHERE id = $1 FOR UPDATE`, [
                    item.insumo_id,
                ]);
                const precioCostoInsumo = Number(productoResultado.rows[0].precio_costo);

                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, 0)
                     ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                    [empresaId, item.insumo_id, sucursalId]
                );
                const stockResultado = await cliente.query(
                    `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                    [item.insumo_id, sucursalId]
                );
                const stockActual = Number(stockResultado.rows[0].stock);
                if (stockActual < cantidadConsumida) {
                    throw new ErrorNegocio(
                        `No hay suficiente stock de "${item.insumo_nombre}" en esta sucursal (hace falta ${cantidadConsumida.toLocaleString('es-PY')}, hay ${stockActual.toLocaleString('es-PY')})`
                    );
                }

                costoInsumos += cantidadConsumida * precioCostoInsumo;

                await cliente.query(
                    `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                    [item.insumo_id, sucursalId, cantidadConsumida]
                );
            }

            const ordenInsertada = await cliente.query(
                `INSERT INTO ordenes_produccion (empresa_id, linea_produccion_id, sucursal_id, usuario_id, cantidad_producida, costo_insumos)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [empresaId, lineaProduccionId, sucursalId, usuarioId, cantidadProducida, costoInsumos]
            );

            return ordenInsertada.rows[0];
        });

        res.status(201).json(orden);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Al clasificar: reparte costo_insumos SOLO entre lo que entro a stock de
// venta (nunca el descarte sin valor, ver Contexto del plan) y actualiza
// el costo promedio ponderado de cada producto de calidad con la MISMA
// formula que ya usa crearCompra - la orden de produccion es, para ese
// calculo, "una compra" cuyo precio es el costo de produccion.
export async function clasificarOrden(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { clasificaciones } = req.body;

    if (!Array.isArray(clasificaciones) || clasificaciones.length === 0) {
        return res.status(400).json({ error: 'Cargá al menos una categoría con su cantidad' });
    }

    try {
        const resultado = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const ordenResultado = await cliente.query(`SELECT * FROM ordenes_produccion WHERE id = $1 FOR UPDATE`, [id]);
            const orden = ordenResultado.rows[0];
            if (!orden) {
                throw new ErrorNegocio('La orden de producción no existe');
            }
            if (orden.estado !== 'abierta') {
                throw new ErrorNegocio('Esta orden ya fue clasificada');
            }

            const categoriasResultado = await cliente.query(
                `SELECT id, producto_id FROM categorias_calidad WHERE linea_produccion_id = $1`,
                [orden.linea_produccion_id]
            );
            const categoriasPorId = new Map(categoriasResultado.rows.map((c) => [c.id, c]));

            let sumaTotal = 0;
            let sumaConValor = 0;
            for (const c of clasificaciones) {
                if (!categoriasPorId.has(c.categoriaCalidadId) || !(Number(c.cantidad) >= 0)) {
                    throw new ErrorNegocio('Una de las categorías clasificadas no es válida');
                }
                sumaTotal += Number(c.cantidad);
                if (categoriasPorId.get(c.categoriaCalidadId).producto_id) {
                    sumaConValor += Number(c.cantidad);
                }
            }
            if (Math.abs(sumaTotal - Number(orden.cantidad_producida)) > 0.01) {
                throw new ErrorNegocio(
                    `La clasificación (${sumaTotal.toLocaleString('es-PY')}) no coincide con la cantidad producida (${Number(orden.cantidad_producida).toLocaleString('es-PY')})`
                );
            }

            const costoUnitario = sumaConValor > 0 ? Number(orden.costo_insumos) / sumaConValor : 0;

            for (const c of clasificaciones) {
                await cliente.query(
                    `INSERT INTO orden_produccion_clasificacion (empresa_id, orden_produccion_id, categoria_calidad_id, cantidad)
                     VALUES ($1, $2, $3, $4)`,
                    [empresaId, id, c.categoriaCalidadId, c.cantidad]
                );

                const categoria = categoriasPorId.get(c.categoriaCalidadId);
                if (!categoria.producto_id || !(Number(c.cantidad) > 0)) continue;

                // Mismo costo promedio ponderado que crearCompra
                // (comprasController.js) - acá "la compra" es la orden de
                // producción y "el precio" es el costo por unidad recién
                // calculado.
                const productoResultado = await cliente.query(
                    `SELECT precio_costo FROM productos WHERE id = $1 FOR UPDATE`,
                    [categoria.producto_id]
                );
                const costoPromedioActual = Number(productoResultado.rows[0].precio_costo);
                let costoPromedioNuevo = costoUnitario;
                if (costoPromedioActual > 0) {
                    const stockResultado = await cliente.query(
                        `SELECT COALESCE(SUM(stock), 0) AS total FROM producto_stock WHERE producto_id = $1`,
                        [categoria.producto_id]
                    );
                    const stockActual = Number(stockResultado.rows[0].total);
                    costoPromedioNuevo =
                        (stockActual * costoPromedioActual + Number(c.cantidad) * costoUnitario) / (stockActual + Number(c.cantidad));
                }

                await cliente.query(`UPDATE productos SET precio_costo = $2 WHERE id = $1`, [
                    categoria.producto_id,
                    costoPromedioNuevo,
                ]);
                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET stock = producto_stock.stock + $4`,
                    [empresaId, categoria.producto_id, orden.sucursal_id, c.cantidad]
                );
            }

            const ordenActualizada = await cliente.query(
                `UPDATE ordenes_produccion SET estado = 'cerrada', costo_unitario_calculado = $2, cerrada_en = now()
                 WHERE id = $1 RETURNING *`,
                [id, costoUnitario]
            );

            return ordenActualizada.rows[0];
        });

        res.json(resultado);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// ---------------------------------------------------------------------
// Produccion planificada (punto 6 - alimenta la lista de pedido)
// ---------------------------------------------------------------------

export async function listarPlanificacion(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT pp.*, l.nombre AS linea_nombre
         FROM produccion_planificada pp JOIN lineas_produccion l ON l.id = pp.linea_produccion_id
         ORDER BY pp.fecha_aproximada ASC NULLS LAST, pp.creado_en DESC`,
        []
    );
    res.json(resultado.rows);
}

export async function crearPlanificacion(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { lineaProduccionId, cantidadPlanificada, fechaAproximada } = req.body;

    if (!lineaProduccionId || !(Number(cantidadPlanificada) > 0)) {
        return res.status(400).json({ error: 'Elegí una línea de producción y una cantidad mayor a 0' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO produccion_planificada (empresa_id, linea_produccion_id, cantidad_planificada, fecha_aproximada, usuario_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [empresaId, lineaProduccionId, cantidadPlanificada, fechaAproximada || null, usuarioId]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function eliminarPlanificacion(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    await consultaDeEmpresa(empresaId, `DELETE FROM produccion_planificada WHERE id = $1`, [id]);
    res.json({ ok: true });
}
