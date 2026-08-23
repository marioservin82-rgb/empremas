import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { tienePermiso } from '../utils/permisos.js';
import { numeroLocal } from '../utils/numeroLocal.js';

// El cajero no debe ver el precio de costo (revela el margen del negocio) —
// misma regla que ya rige para editar precios: eso es cosa de dueño/
// encargado, salvo que se le haya concedido el permiso extra ver_costos.
async function ocultarCostoSiCorresponde(productos, rol, empresaId, usuarioId) {
    if (rol !== 'cajero') return productos;
    if (await tienePermiso(empresaId, usuarioId, 'ver_costos')) return productos;
    return productos.map(({ precio_costo, ...resto }) => resto);
}

export async function listarProductos(req, res) {
    const { q, limit, offset, excluirInsumos } = req.query;
    const { empresaId, usuarioId, rol, sucursalId } = req.usuario;
    // Vender manda excluirInsumos=true (un insumo de produccion nunca se
    // vende directo al publico) - Stock y el resto de las pantallas de
    // catalogo lo siguen viendo normalmente, se cargan/editan igual que
    // cualquier producto.
    const condicionInsumo = excluirInsumos === 'true' ? 'AND p.es_insumo = false' : '';

    // LEFT JOIN: un producto sin fila todavia en producto_stock para esta
    // sucursal (ej. recien creado en otra sucursal) muestra 0, no se cae.
    const resultado = q
        ? await consultaDeEmpresa(
              empresaId,
              `SELECT p.*, COALESCE(ps.stock, 0) AS stock
               FROM productos p
               LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = $3
               WHERE p.activo = true AND (p.codigo_barras = $1 OR unaccent(lower(p.nombre)) LIKE unaccent(lower($2))) ${condicionInsumo}
               ORDER BY p.nombre LIMIT 50`,
              [q, `%${q}%`, sucursalId]
          )
        : await consultaDeEmpresa(
              // Sin busqueda: por defecto (sin limit/offset) devuelve el
              // catalogo entero, hasta 5000 - lo sigue necesitando el
              // inventario de cantidades (planilla imprimible completa).
              // La pantalla de Stock en cambio SI manda limit/offset para
              // traer de a paginas - con miles de productos, traer y
              // renderizar todo de una tildaba el navegador cada vez que
              // volvia a esta pantalla (ej. justo despues de cargar un
              // producto nuevo).
              empresaId,
              `SELECT p.*, COALESCE(ps.stock, 0) AS stock
               FROM productos p
               LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = $1
               WHERE p.activo = true ${condicionInsumo} ORDER BY p.nombre LIMIT $2 OFFSET $3`,
              [sucursalId, limit ? Number(limit) : 5000, offset ? Number(offset) : 0]
          );

    res.json(await ocultarCostoSiCorresponde(resultado.rows, rol, empresaId, usuarioId));
}

function numOrNull(v) {
    return numeroLocal(v);
}

const CAMPOS_NUMERICOS_IMPORT = [
    ['precioCosto', 'precio_costo'],
    ['precioContado', 'precio_contado'],
    ['precioCredito', 'precio_credito'],
    ['precioMayorista', 'precio_mayorista'],
    ['stock', 'stock'],
];

// Importacion masiva desde CSV (el parseo del archivo se hace en el
// frontend, esto recibe filas ya como objetos). Matchea por codigo_barras:
// si existe un producto con ese codigo en la empresa, lo actualiza (nombre/
// precios/IVA, nunca el stock — eso sigue yendo por Ajuste de Inventario
// para no perder el rastro auditado); si no, crea uno nuevo. Filas
// invalidas (sin nombre, IVA invalido) se reportan pero no frenan al
// resto.
export async function importarProductos(req, res) {
    const { empresaId, sucursalId } = req.usuario;
    const { productos } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ error: 'No hay productos para importar' });
    }

    const validos = [];
    const errores = [];
    productos.forEach((p, indice) => {
        const fila = indice + 2; // fila 1 es el encabezado del CSV
        if (!p.nombre || !String(p.nombre).trim()) {
            errores.push({ fila, motivo: 'Falta el nombre' });
            return;
        }
        if (p.tasaIva !== undefined && p.tasaIva !== '' && ![0, 5, 10].includes(Number(p.tasaIva))) {
            errores.push({ fila, motivo: 'tasa_iva debe ser 0, 5 o 10' });
            return;
        }
        const campoInvalido = CAMPOS_NUMERICOS_IMPORT.find(([campo]) => Number.isNaN(numeroLocal(p[campo])));
        if (campoInvalido) {
            errores.push({ fila, motivo: `"${p[campoInvalido[0]]}" no es un número válido para ${campoInvalido[1]}` });
            return;
        }
        validos.push(p);
    });

    let creados = 0;
    let actualizados = 0;

    if (validos.length > 0) {
      try {
        await transaccionDeEmpresa(empresaId, async (cliente) => {
            for (const p of validos) {
                const codigoBarras = p.codigoBarras ? String(p.codigoBarras).trim() : null;
                let existenteId = null;
                if (codigoBarras) {
                    const resultado = await cliente.query(`SELECT id FROM productos WHERE codigo_barras = $1`, [
                        codigoBarras,
                    ]);
                    existenteId = resultado.rows[0]?.id ?? null;
                }

                if (existenteId) {
                    await cliente.query(
                        `UPDATE productos SET
                            nombre = COALESCE($2, nombre),
                            unidad_medida = COALESCE($3, unidad_medida),
                            precio_costo = COALESCE($4, precio_costo),
                            precio_contado = COALESCE($5, precio_contado),
                            precio_credito = COALESCE($6, precio_credito),
                            precio_mayorista = COALESCE($7, precio_mayorista),
                            tasa_iva = COALESCE($8, tasa_iva)
                         WHERE id = $1`,
                        [
                            existenteId,
                            p.nombre,
                            p.unidadMedida || null,
                            numOrNull(p.precioCosto),
                            numOrNull(p.precioContado),
                            numOrNull(p.precioCredito),
                            numOrNull(p.precioMayorista),
                            numOrNull(p.tasaIva),
                        ]
                    );
                    actualizados++;
                } else {
                    const productoInsertado = await cliente.query(
                        `INSERT INTO productos (empresa_id, codigo_barras, nombre, unidad_medida, precio_costo, precio_contado, precio_credito, precio_mayorista, tasa_iva)
                         VALUES ($1, $2, $3, COALESCE($4, 'unidad'), COALESCE($5, 0::numeric), COALESCE($6, 0::numeric), COALESCE($7, 0::numeric), COALESCE($8, 0::numeric), COALESCE($9, 10::smallint))
                         RETURNING id`,
                        [
                            empresaId,
                            codigoBarras,
                            p.nombre,
                            p.unidadMedida || null,
                            numOrNull(p.precioCosto),
                            numOrNull(p.precioContado),
                            numOrNull(p.precioCredito),
                            numOrNull(p.precioMayorista),
                            numOrNull(p.tasaIva),
                        ]
                    );
                    await cliente.query(
                        `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock) VALUES ($1, $2, $3, $4)`,
                        [empresaId, productoInsertado.rows[0].id, sucursalId, numOrNull(p.stock) || 0]
                    );
                    creados++;
                }
            }
        });
      } catch (error) {
        console.error('Error en importarProductos:', error);
        return res.status(400).json({
            error: 'No se pudo completar la importación — revisá que los precios y el stock tengan formato de número válido e intentá de nuevo.',
        });
      }
    }

    res.json({ creados, actualizados, errores });
}

export async function obtenerProducto(req, res) {
    const { empresaId, usuarioId, rol, sucursalId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT p.*, COALESCE(ps.stock, 0) AS stock
         FROM productos p
         LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = $2
         WHERE p.id = $1`,
        [id, sucursalId]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json((await ocultarCostoSiCorresponde([resultado.rows[0]], rol, empresaId, usuarioId))[0]);
}

export async function crearProducto(req, res) {
    const { empresaId, sucursalId } = req.usuario;
    const {
        codigoBarras,
        nombre,
        unidadMedida,
        precioCosto,
        precioContado,
        precioCredito,
        precioMayorista,
        tasaIva,
        stock,
        stockMinimo,
        esInsumo,
        unidadCompra,
        equivalenciaUnidadCompra,
    } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (tasaIva !== undefined && ![0, 5, 10].includes(tasaIva)) {
        return res.status(400).json({ error: 'La tasa de IVA debe ser 0, 5 o 10' });
    }
    // Un insumo de produccion nunca se vende directo - no tiene sentido
    // exigirle un precio de venta.
    if (!esInsumo && !(Number(precioContado) > 0)) {
        return res.status(400).json({ error: 'El precio contado (precio de venta) es obligatorio y debe ser mayor a 0' });
    }

    const producto = await transaccionDeEmpresa(empresaId, async (cliente) => {
        const productoInsertado = await cliente.query(
            `INSERT INTO productos (
                empresa_id, codigo_barras, nombre, unidad_medida,
                precio_costo, precio_contado, precio_credito, precio_mayorista, tasa_iva, stock_minimo,
                es_insumo, unidad_compra, equivalencia_unidad_compra
             )
             VALUES ($1, $2, $3, COALESCE($4, 'unidad'), COALESCE($5, 0::numeric), COALESCE($6, 0::numeric), COALESCE($7, 0::numeric), COALESCE($8, 0::numeric), COALESCE($9, 10::smallint), $10, COALESCE($11, false), $12, $13)
             RETURNING *`,
            [
                empresaId,
                codigoBarras || null,
                nombre,
                unidadMedida,
                precioCosto,
                precioContado,
                precioCredito,
                precioMayorista,
                tasaIva,
                stockMinimo || null,
                esInsumo,
                unidadCompra || null,
                equivalenciaUnidadCompra || null,
            ]
        );
        const nuevoProducto = productoInsertado.rows[0];

        // El stock inicial se carga en la sucursal de quien crea el
        // producto (con una sola sucursal, es simplemente "el" stock).
        await cliente.query(
            `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock) VALUES ($1, $2, $3, $4)`,
            [empresaId, nuevoProducto.id, sucursalId, stock || 0]
        );

        return { ...nuevoProducto, stock: Number(stock) || 0 };
    });

    res.status(201).json(producto);
}

// El stock deliberadamente NO se puede tocar desde aca (ver
// producto_stock) — pasa siempre por Ajuste de Inventario, para no
// perder el rastro auditado de quien/cuando/por que cambio.
export async function actualizarProducto(req, res) {
    const { empresaId, sucursalId } = req.usuario;
    const { id } = req.params;
    const {
        codigoBarras,
        nombre,
        unidadMedida,
        precioContado,
        precioCredito,
        precioMayorista,
        tasaIva,
        stockMinimo,
        activo,
        esInsumo,
        unidadCompra,
        equivalenciaUnidadCompra,
    } = req.body;

    if (tasaIva !== undefined && ![0, 5, 10].includes(tasaIva)) {
        return res.status(400).json({ error: 'La tasa de IVA debe ser 0, 5 o 10' });
    }

    // precio_costo NO se acepta aca a proposito: desde que es un costo
    // promedio ponderado (ver crearCompra), solo lo actualiza una compra
    // nueva - permitir pisarlo a mano rompería el calculo. Todo con
    // COALESCE (incluida la conversion de unidad de compra) porque este
    // endpoint tambien se usa para PATCHes parciales de un solo campo
    // (ej. {activo:false}) en varios lugares de la app - un COALESCE
    // simple evita que un PATCH parcial borre sin querer un campo que no
    // vino en ese request puntual.
    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE productos SET
            codigo_barras = COALESCE($3, codigo_barras),
            nombre = COALESCE($4, nombre),
            unidad_medida = COALESCE($5, unidad_medida),
            precio_contado = COALESCE($6, precio_contado),
            precio_credito = COALESCE($7, precio_credito),
            precio_mayorista = COALESCE($8, precio_mayorista),
            tasa_iva = COALESCE($9, tasa_iva),
            stock_minimo = COALESCE($10, stock_minimo),
            activo = COALESCE($11, activo),
            es_insumo = COALESCE($12, es_insumo),
            unidad_compra = COALESCE($13, unidad_compra),
            equivalencia_unidad_compra = COALESCE($14, equivalencia_unidad_compra)
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [
            id,
            empresaId,
            codigoBarras,
            nombre,
            unidadMedida,
            precioContado,
            precioCredito,
            precioMayorista,
            tasaIva,
            stockMinimo,
            activo,
            esInsumo,
            unidadCompra || null,
            equivalenciaUnidadCompra || null,
        ]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const stockActual = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(stock, 0) AS stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2`,
        [id, sucursalId]
    );

    res.json({ ...resultado.rows[0], stock: Number(stockActual.rows[0]?.stock ?? 0) });
}

// Ajuste de inventario: corrige el stock a un conteo real, con motivo
// obligatorio (conteo fisico, rotura, vencido, robo, etc.) para dejar
// rastro de por que cambio, en vez de solo "editar" el numero sin mas.
export async function ajustarInventario(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { id } = req.params;
    const { cantidadNueva, motivo } = req.body;

    if (!(Number(cantidadNueva) >= 0)) {
        return res.status(400).json({ error: 'La cantidad nueva debe ser 0 o mayor' });
    }
    if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'El motivo es obligatorio' });
    }

    try {
        const ajuste = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const productoResultado = await cliente.query(`SELECT nombre FROM productos WHERE id = $1`, [id]);
            const producto = productoResultado.rows[0];
            if (!producto) {
                throw new ErrorNegocio('El producto no existe');
            }

            // Si el producto todavia no tiene fila de stock en esta
            // sucursal (ej. se creo en otra), la crea en 0 antes de
            // bloquearla — asi el ajuste siempre tiene una fila para leer.
            await cliente.query(
                `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                 VALUES ($1, $2, $3, 0)
                 ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                [empresaId, id, sucursalId]
            );

            const stockResultado = await cliente.query(
                `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                [id, sucursalId]
            );
            const cantidadAnterior = Number(stockResultado.rows[0].stock);
            const diferencia = Number(cantidadNueva) - cantidadAnterior;

            await cliente.query(
                `UPDATE producto_stock SET stock = $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                [id, sucursalId, cantidadNueva]
            );

            const ajusteInsertado = await cliente.query(
                `INSERT INTO ajustes_inventario (empresa_id, producto_id, usuario_id, sucursal_id, cantidad_anterior, cantidad_nueva, diferencia, motivo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, creado_en`,
                [empresaId, id, usuarioId, sucursalId, cantidadAnterior, cantidadNueva, diferencia, motivo.trim()]
            );

            return {
                id: ajusteInsertado.rows[0].id,
                creadoEn: ajusteInsertado.rows[0].creado_en,
                productoId: id,
                productoNombre: producto.nombre,
                cantidadAnterior,
                cantidadNueva: Number(cantidadNueva),
                diferencia,
                motivo: motivo.trim(),
            };
        });

        res.status(201).json(ajuste);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function historialAjustes(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM ajustes_inventario WHERE producto_id = $1 ORDER BY creado_en DESC LIMIT 100`,
        [id]
    );

    res.json(resultado.rows);
}

// Inventario valorizado: cuanto vale todo el stock, a precio de costo y a
// precio de venta (para ver de un vistazo cuanta plata esta "guardada" en
// mercaderia). Solo dueno/encargado (revela costo y margen).
export async function inventarioValorizado(req, res) {
    const { empresaId } = req.usuario;

    // Suma el stock de todas las sucursales por producto — el dueno/
    // encargado ve el valorizado de toda la empresa, no de un solo local.
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT p.id, p.nombre, p.unidad_medida, p.precio_costo, p.precio_contado,
                COALESCE(SUM(ps.stock), 0) AS stock,
                COALESCE(SUM(ps.stock), 0) * p.precio_costo AS valor_costo,
                COALESCE(SUM(ps.stock), 0) * p.precio_contado AS valor_venta
         FROM productos p
         LEFT JOIN producto_stock ps ON ps.producto_id = p.id
         WHERE p.activo = true
         GROUP BY p.id, p.nombre, p.unidad_medida, p.precio_costo, p.precio_contado
         ORDER BY valor_costo DESC`,
        []
    );

    const totalCosto = resultado.rows.reduce((acumulado, p) => acumulado + Number(p.valor_costo), 0);
    const totalVenta = resultado.rows.reduce((acumulado, p) => acumulado + Number(p.valor_venta), 0);

    res.json({ productos: resultado.rows, totalCosto, totalVenta });
}

// Venta cruzada: productos asociados de forma manual (por el dueno, desde
// la ficha) o automatica (aprobada desde las sugerencias por coocurrencia).
// Lectura libre para cualquier rol logueado — el cajero necesita esto en
// Vender para mostrar la sugerencia al agregar un producto al carrito.
export async function listarAsociados(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT p.id, p.nombre, p.codigo_barras, p.unidad_medida,
                p.precio_contado, p.precio_credito, p.precio_mayorista, pa.origen
         FROM producto_asociaciones pa
         JOIN productos p ON p.id = pa.producto_asociado_id
         WHERE pa.producto_id = $1 AND pa.estado = 'activa' AND p.activo = true
         ORDER BY p.nombre`,
        [id]
    );

    res.json(resultado.rows);
}

export async function agregarAsociacion(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const { productoAsociadoId } = req.body;

    if (!productoAsociadoId) {
        return res.status(400).json({ error: 'Falta elegir el producto a asociar' });
    }
    if (productoAsociadoId === id) {
        return res.status(400).json({ error: 'Un producto no puede asociarse consigo mismo' });
    }

    const productoAsociado = await consultaDeEmpresa(
        empresaId,
        `SELECT id FROM productos WHERE id = $1 AND activo = true`,
        [productoAsociadoId]
    );
    if (!productoAsociado.rows[0]) {
        return res.status(404).json({ error: 'El producto a asociar no existe o no está activo' });
    }

    // ON CONFLICT: si ya existia descartada (de una sugerencia automatica
    // anterior), cargarla a mano la reactiva en vez de chocar.
    const insertado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO producto_asociaciones (empresa_id, producto_id, producto_asociado_id, origen, estado, usuario_id)
         VALUES ($1, $2, $3, 'manual', 'activa', $4)
         ON CONFLICT (producto_id, producto_asociado_id) DO UPDATE SET estado = 'activa'
         RETURNING id`,
        [empresaId, id, productoAsociadoId, usuarioId]
    );

    res.status(201).json({ id: insertado.rows[0].id });
}

export async function quitarAsociacion(req, res) {
    const { empresaId } = req.usuario;
    const { id, asociadoId } = req.params;

    await consultaDeEmpresa(
        empresaId,
        `DELETE FROM producto_asociaciones WHERE producto_id = $1 AND producto_asociado_id = $2`,
        [id, asociadoId]
    );

    res.json({ ok: true });
}

// Sugerencias automaticas: productos que se compran juntos con frecuencia,
// calculado al vuelo sobre venta_items (no hay scheduler en este proyecto,
// asi que nunca se pre-genera ni se cachea nada). Umbral fijo: al menos 5
// ventas juntas y que representen al menos el 20% de las ventas del
// producto base, para no sugerir por una sola coincidencia aislada.
const MINIMO_VENTAS_JUNTAS = 5;
const MINIMO_PORCENTAJE = 0.2;

export async function sugerenciasAsociaciones(req, res) {
    const { empresaId } = req.usuario;

    const pares = await consultaDeEmpresa(
        empresaId,
        `SELECT vi1.producto_id, vi2.producto_id AS producto_asociado_id,
                COUNT(DISTINCT vi1.venta_id) AS ventas_juntas
         FROM venta_items vi1
         JOIN venta_items vi2 ON vi2.venta_id = vi1.venta_id AND vi2.producto_id <> vi1.producto_id
         JOIN ventas v ON v.id = vi1.venta_id AND v.anulada = false
         GROUP BY vi1.producto_id, vi2.producto_id
         HAVING COUNT(DISTINCT vi1.venta_id) >= $1`,
        [MINIMO_VENTAS_JUNTAS]
    );

    if (pares.rows.length === 0) {
        return res.json([]);
    }

    const totales = await consultaDeEmpresa(
        empresaId,
        `SELECT vi.producto_id, COUNT(DISTINCT vi.venta_id) AS total_ventas
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id AND v.anulada = false
         GROUP BY vi.producto_id`,
        []
    );
    const totalVentasPorProducto = new Map(totales.rows.map((f) => [f.producto_id, Number(f.total_ventas)]));

    const existentes = await consultaDeEmpresa(
        empresaId,
        `SELECT producto_id, producto_asociado_id FROM producto_asociaciones`,
        []
    );
    const yaResueltos = new Set(existentes.rows.map((f) => `${f.producto_id}:${f.producto_asociado_id}`));

    const idsProductos = [
        ...new Set(pares.rows.flatMap((f) => [f.producto_id, f.producto_asociado_id])),
    ];
    const nombres = await consultaDeEmpresa(
        empresaId,
        `SELECT id, nombre FROM productos WHERE id = ANY($1::uuid[]) AND activo = true`,
        [idsProductos]
    );
    const nombrePorId = new Map(nombres.rows.map((f) => [f.id, f.nombre]));

    const candidatas = pares.rows
        .filter((f) => !yaResueltos.has(`${f.producto_id}:${f.producto_asociado_id}`))
        .filter((f) => nombrePorId.has(f.producto_id) && nombrePorId.has(f.producto_asociado_id))
        .map((f) => {
            const totalVentas = totalVentasPorProducto.get(f.producto_id) || 0;
            const ventasJuntas = Number(f.ventas_juntas);
            const porcentaje = totalVentas > 0 ? ventasJuntas / totalVentas : 0;
            return {
                productoId: f.producto_id,
                productoNombre: nombrePorId.get(f.producto_id),
                asociadoId: f.producto_asociado_id,
                asociadoNombre: nombrePorId.get(f.producto_asociado_id),
                ventasJuntas,
                porcentaje: Math.round(porcentaje * 100),
            };
        })
        .filter((f) => f.porcentaje >= MINIMO_PORCENTAJE * 100)
        .sort((a, b) => b.porcentaje - a.porcentaje);

    res.json(candidatas);
}

export async function resolverSugerencia(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { productoId, productoAsociadoId, decision } = req.body;

    if (!productoId || !productoAsociadoId) {
        return res.status(400).json({ error: 'Faltan los productos de la sugerencia' });
    }
    if (!['aprobar', 'descartar'].includes(decision)) {
        return res.status(400).json({ error: 'decision debe ser aprobar o descartar' });
    }

    const estado = decision === 'aprobar' ? 'activa' : 'descartada';

    await consultaDeEmpresa(
        empresaId,
        `INSERT INTO producto_asociaciones (empresa_id, producto_id, producto_asociado_id, origen, estado, usuario_id)
         VALUES ($1, $2, $3, 'automatica', $4, $5)
         ON CONFLICT (producto_id, producto_asociado_id) DO UPDATE SET estado = $4`,
        [empresaId, productoId, productoAsociadoId, estado, usuarioId]
    );

    res.json({ ok: true });
}
