import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { turnoAbiertoDe } from './turnosController.js';
import { numeroLocal } from '../utils/numeroLocal.js';

const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito'];

export async function listarProveedores(req, res) {
    const { q } = req.query;
    const { empresaId } = req.usuario;

    const resultado = q
        ? await consultaDeEmpresa(
              empresaId,
              `SELECT * FROM proveedores
               WHERE activo = true AND (documento LIKE $1 OR unaccent(lower(nombre)) LIKE unaccent(lower($2)))
               ORDER BY nombre LIMIT 50`,
              [`%${q}%`, `%${q}%`]
          )
        : await consultaDeEmpresa(
              empresaId,
              `SELECT * FROM proveedores WHERE activo = true ORDER BY nombre LIMIT 100`,
              []
          );

    res.json(resultado.rows);
}

export async function obtenerProveedor(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(empresaId, `SELECT * FROM proveedores WHERE id = $1`, [id]);

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json(resultado.rows[0]);
}

export async function crearProveedor(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { nombre, documento, telefono, email, direccion, saldoInicial } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (saldoInicial !== undefined && !(Number(saldoInicial) >= 0)) {
        return res.status(400).json({ error: 'El saldo inicial debe ser 0 o mayor' });
    }

    // Mismo motivo que crearCliente: si viene saldoInicial (migracion de un
    // proveedor al que ya le debiamos antes de EMPREMAS), queda registrado
    // como un ajuste dentro del mismo request.
    const proveedor = await transaccionDeEmpresa(empresaId, async (db) => {
        const insertado = await db.query(
            `INSERT INTO proveedores (empresa_id, nombre, documento, telefono, email, direccion, saldo)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0::numeric))
             RETURNING *`,
            [empresaId, nombre, documento || null, telefono || null, email || null, direccion || null, saldoInicial]
        );
        const nuevoProveedor = insertado.rows[0];

        if (Number(saldoInicial) > 0) {
            await db.query(
                `INSERT INTO ajustes_saldo_proveedor (empresa_id, proveedor_id, usuario_id, saldo_anterior, saldo_nuevo, diferencia, motivo)
                 VALUES ($1, $2, $3, 0, $4, $4, 'Saldo inicial (migración)')`,
                [empresaId, nuevoProveedor.id, usuarioId, saldoInicial]
            );
        }

        return nuevoProveedor;
    });

    res.status(201).json(proveedor);
}

// Importacion masiva desde CSV, simetrica a importarClientes/
// importarProductos: matchea por documento (si existe, actualiza sin
// tocar el saldo; si no, crea con el mismo saldoInicial+ajuste auditado
// que ya usa crearProveedor). Filas invalidas se reportan pero no frenan
// al resto.
export async function importarProveedores(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { proveedores } = req.body;

    if (!Array.isArray(proveedores) || proveedores.length === 0) {
        return res.status(400).json({ error: 'No hay proveedores para importar' });
    }

    const validos = [];
    const errores = [];
    proveedores.forEach((p, indice) => {
        const fila = indice + 2; // fila 1 es el encabezado del CSV
        if (!p.nombre || !String(p.nombre).trim()) {
            errores.push({ fila, motivo: 'Falta el nombre' });
            return;
        }
        const saldoInicialNum = numeroLocal(p.saldoInicial);
        if (Number.isNaN(saldoInicialNum)) {
            errores.push({ fila, motivo: `"${p.saldoInicial}" no es un número válido para saldo_inicial` });
            return;
        }
        if (saldoInicialNum !== null && !(saldoInicialNum >= 0)) {
            errores.push({ fila, motivo: 'saldo_inicial debe ser 0 o mayor' });
            return;
        }
        validos.push(p);
    });

    let creados = 0;
    let actualizados = 0;

    if (validos.length > 0) {
      try {
        await transaccionDeEmpresa(empresaId, async (db) => {
            for (const p of validos) {
                const documento = p.documento ? String(p.documento).trim() : null;
                let existenteId = null;
                if (documento) {
                    const resultado = await db.query(`SELECT id FROM proveedores WHERE documento = $1`, [documento]);
                    existenteId = resultado.rows[0]?.id ?? null;
                }

                if (existenteId) {
                    await db.query(
                        `UPDATE proveedores SET
                            nombre = COALESCE($2, nombre),
                            telefono = COALESCE($3, telefono),
                            email = COALESCE($4, email),
                            direccion = COALESCE($5, direccion)
                         WHERE id = $1`,
                        [existenteId, p.nombre, p.telefono || null, p.email || null, p.direccion || null]
                    );
                    actualizados++;
                } else {
                    const saldoInicial = numeroLocal(p.saldoInicial) ?? 0;
                    const insertado = await db.query(
                        `INSERT INTO proveedores (empresa_id, nombre, documento, telefono, email, direccion, saldo)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         RETURNING id`,
                        [empresaId, p.nombre, documento, p.telefono || null, p.email || null, p.direccion || null, saldoInicial]
                    );
                    if (saldoInicial > 0) {
                        await db.query(
                            `INSERT INTO ajustes_saldo_proveedor (empresa_id, proveedor_id, usuario_id, saldo_anterior, saldo_nuevo, diferencia, motivo)
                             VALUES ($1, $2, $3, 0, $4, $4, 'Saldo inicial (migración)')`,
                            [empresaId, insertado.rows[0].id, usuarioId, saldoInicial]
                        );
                    }
                    creados++;
                }
            }
        });
      } catch (error) {
        console.error('Error en importarProveedores:', error);
        return res.status(400).json({
            error: 'No se pudo completar la importación — revisá que los números tengan formato válido e intentá de nuevo.',
        });
      }
    }

    res.json({ creados, actualizados, errores });
}

// Ajuste manual de saldo, simetrico a clientesController.ajustarSaldo.
export async function ajustarSaldo(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const { saldoNuevo, motivo } = req.body;

    if (!(Number(saldoNuevo) >= 0)) {
        return res.status(400).json({ error: 'El saldo nuevo debe ser 0 o mayor' });
    }
    if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'El motivo es obligatorio' });
    }

    try {
        const ajuste = await transaccionDeEmpresa(empresaId, async (db) => {
            const proveedorResultado = await db.query(`SELECT nombre, saldo FROM proveedores WHERE id = $1 FOR UPDATE`, [id]);
            const proveedor = proveedorResultado.rows[0];
            if (!proveedor) {
                throw new ErrorNegocio('El proveedor no existe');
            }

            const saldoAnterior = Number(proveedor.saldo);
            const diferencia = Number(saldoNuevo) - saldoAnterior;

            await db.query(`UPDATE proveedores SET saldo = $2 WHERE id = $1`, [id, saldoNuevo]);

            const ajusteInsertado = await db.query(
                `INSERT INTO ajustes_saldo_proveedor (empresa_id, proveedor_id, usuario_id, saldo_anterior, saldo_nuevo, diferencia, motivo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, creado_en`,
                [empresaId, id, usuarioId, saldoAnterior, saldoNuevo, diferencia, motivo.trim()]
            );

            return {
                id: ajusteInsertado.rows[0].id,
                creadoEn: ajusteInsertado.rows[0].creado_en,
                proveedorId: id,
                proveedorNombre: proveedor.nombre,
                saldoAnterior,
                saldoNuevo: Number(saldoNuevo),
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

export async function historialAjustesSaldo(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM ajustes_saldo_proveedor WHERE proveedor_id = $1 ORDER BY creado_en DESC LIMIT 100`,
        [id]
    );

    res.json(resultado.rows);
}

export async function actualizarProveedor(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, documento, telefono, email, direccion, activo } = req.body;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE proveedores SET
            nombre = COALESCE($3, nombre),
            documento = COALESCE($4, documento),
            telefono = COALESCE($5, telefono),
            email = COALESCE($6, email),
            direccion = COALESCE($7, direccion),
            activo = COALESCE($8, activo)
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [id, empresaId, nombre, documento, telefono, email, direccion, activo]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json(resultado.rows[0]);
}

// Extracto de proveedor: historial de compras + saldo actual, para saber
// que le compramos y cuanto le debemos.
export async function extractoProveedor(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { desde, hasta } = req.query;

    const proveedor = await consultaDeEmpresa(empresaId, `SELECT * FROM proveedores WHERE id = $1`, [id]);
    if (!proveedor.rows[0]) {
        return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    // hasta es inclusive: hasta el final de ese dia (mismo criterio que
    // listarVentas). Los pagos filtran por fecha_pago (la que se muestra),
    // no por creado_en, cuando esta cargada.
    const condicionesCompras = [];
    const valoresCompras = [];
    if (desde) {
        valoresCompras.push(desde);
        condicionesCompras.push(`creado_en >= $${valoresCompras.length + 1}::date`);
    }
    if (hasta) {
        valoresCompras.push(hasta);
        condicionesCompras.push(`creado_en < ($${valoresCompras.length + 1}::date + INTERVAL '1 day')`);
    }
    const whereCompras = condicionesCompras.length > 0 ? `AND ${condicionesCompras.join(' AND ')}` : '';

    const condicionesPagos = [];
    const valoresPagos = [];
    if (desde) {
        valoresPagos.push(desde);
        condicionesPagos.push(`COALESCE(fecha_pago, creado_en::date) >= $${valoresPagos.length + 1}::date`);
    }
    if (hasta) {
        valoresPagos.push(hasta);
        condicionesPagos.push(`COALESCE(fecha_pago, creado_en::date) < ($${valoresPagos.length + 1}::date + INTERVAL '1 day')`);
    }
    const wherePagos = condicionesPagos.length > 0 ? `AND ${condicionesPagos.join(' AND ')}` : '';

    const compras = await consultaDeEmpresa(
        empresaId,
        `SELECT id, tipo_pago, total, creado_en, anulada FROM compras WHERE proveedor_id = $1 ${whereCompras} ORDER BY creado_en DESC LIMIT 200`,
        [id, ...valoresCompras]
    );

    const pagos = await consultaDeEmpresa(
        empresaId,
        `SELECT id, forma_pago, monto, fecha_pago, numero_recibo, creado_en FROM pagos_proveedor WHERE proveedor_id = $1 ${wherePagos} ORDER BY creado_en DESC LIMIT 200`,
        [id, ...valoresPagos]
    );

    const ajustesSaldo = await consultaDeEmpresa(
        empresaId,
        `SELECT id, saldo_anterior, saldo_nuevo, diferencia, motivo, creado_en
         FROM ajustes_saldo_proveedor WHERE proveedor_id = $1 ${whereCompras} ORDER BY creado_en DESC LIMIT 200`,
        [id, ...valoresCompras]
    );

    res.json({
        proveedor: proveedor.rows[0],
        compras: compras.rows,
        pagos: pagos.rows,
        ajustesSaldo: ajustesSaldo.rows,
    });
}

// Lista de pedido inteligente: que productos pedirle a este proveedor,
// priorizando lo que menos stock tiene, con el punto de pedido (stock_
// minimo, ya existia en productos pero no lo usaba ninguna pantalla) y
// comparando el ultimo precio pagado a este proveedor contra el de
// cualquier otro proveedor que tambien haya vendido el mismo producto
// alguna vez. No hay tabla producto-proveedor: se arma todo a partir del
// historial de compras (compra_items + compras).
export async function listaPedido(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const proveedor = await consultaDeEmpresa(empresaId, `SELECT id, nombre FROM proveedores WHERE id = $1`, [id]);
    if (!proveedor.rows[0]) {
        return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const productosComprados = await consultaDeEmpresa(
        empresaId,
        `SELECT DISTINCT ci.producto_id
         FROM compra_items ci
         JOIN compras c ON c.id = ci.compra_id
         WHERE c.proveedor_id = $1`,
        [id]
    );
    const productoIds = productosComprados.rows.map((r) => r.producto_id);
    if (productoIds.length === 0) {
        return res.json({ proveedor: proveedor.rows[0], productos: [] });
    }

    // Stock sumado de todas las sucursales, mismo criterio que
    // inventarioValorizado: el punto de pedido tampoco es por sucursal.
    const productos = await consultaDeEmpresa(
        empresaId,
        `SELECT p.id, p.nombre, p.stock_minimo, p.precio_costo, COALESCE(SUM(ps.stock), 0) AS stock
         FROM productos p
         LEFT JOIN producto_stock ps ON ps.producto_id = p.id
         WHERE p.activo = true AND p.id = ANY($1::uuid[])
         GROUP BY p.id, p.nombre, p.stock_minimo, p.precio_costo`,
        [productoIds]
    );

    // Ultimo precio pagado por producto, para CADA proveedor que alguna
    // vez lo vendio (no solo el proveedor seleccionado) - de ahi sale la
    // comparacion.
    const precios = await consultaDeEmpresa(
        empresaId,
        `SELECT DISTINCT ON (ci.producto_id, c.proveedor_id)
                ci.producto_id, c.proveedor_id, pr.nombre AS proveedor_nombre, ci.precio_unitario
         FROM compra_items ci
         JOIN compras c ON c.id = ci.compra_id
         JOIN proveedores pr ON pr.id = c.proveedor_id
         WHERE ci.producto_id = ANY($1::uuid[]) AND pr.activo = true AND NOT c.anulada
         ORDER BY ci.producto_id, c.proveedor_id, c.fecha_compra DESC, c.creado_en DESC`,
        [productoIds]
    );

    const preciosPorProducto = new Map();
    for (const fila of precios.rows) {
        if (!preciosPorProducto.has(fila.producto_id)) {
            preciosPorProducto.set(fila.producto_id, []);
        }
        preciosPorProducto.get(fila.producto_id).push({
            proveedorId: fila.proveedor_id,
            proveedorNombre: fila.proveedor_nombre,
            precio: Number(fila.precio_unitario),
            esEsteProveedor: fila.proveedor_id === id,
        });
    }

    // Modulo de Produccion (punto 6): ademas de la alerta reactiva por
    // stock bajo, proyecta cuanto de este insumo hace falta para la
    // produccion ya planificada (produccion_planificada), via la receta
    // de cada linea que lo usa. Solo tiene sentido si la empresa tiene el
    // modulo activo - se deja vacio (sin tocar el resto del comportamiento
    // ya existente) para cualquier otra empresa.
    const empresaResultado = await consultaDeEmpresa(empresaId, `SELECT produccion_habilitada FROM empresas WHERE id = $1`, [empresaId]);
    const necesidadPorInsumo = new Map();
    if (empresaResultado.rows[0]?.produccion_habilitada) {
        const necesidad = await consultaDeEmpresa(
            empresaId,
            `SELECT ri.insumo_id, SUM(ri.cantidad * pp.cantidad_planificada / l.cantidad_referencia) AS necesidad
             FROM produccion_planificada pp
             JOIN lineas_produccion l ON l.id = pp.linea_produccion_id
             JOIN receta_items ri ON ri.linea_produccion_id = l.id
             WHERE ri.insumo_id = ANY($1::uuid[])
             GROUP BY ri.insumo_id`,
            [productoIds]
        );
        for (const fila of necesidad.rows) {
            necesidadPorInsumo.set(fila.insumo_id, Number(fila.necesidad));
        }
    }

    const lista = productos.rows.map((p) => {
        const stock = Number(p.stock);
        const stockMinimo = p.stock_minimo != null ? Number(p.stock_minimo) : null;
        const preciosProducto = (preciosPorProducto.get(p.id) || []).sort((a, b) => a.precio - b.precio);
        const precioMasBarato = preciosProducto.length > 0 ? preciosProducto[0].precio : null;
        const necesidadProduccionPlanificada = necesidadPorInsumo.get(p.id) ?? null;

        return {
            id: p.id,
            nombre: p.nombre,
            stock,
            stockMinimo,
            costoPromedio: Number(p.precio_costo),
            bajoPuntoPedido: stockMinimo != null && stock < stockMinimo,
            precios: preciosProducto.map((precio) => ({ ...precio, masBarato: precio.precio === precioMasBarato })),
            necesidadProduccionPlanificada,
            faltanteProduccionPlanificada:
                necesidadProduccionPlanificada != null ? Math.max(0, necesidadProduccionPlanificada - stock) : null,
        };
    });

    lista.sort((a, b) => a.stock - b.stock);

    res.json({ proveedor: proveedor.rows[0], productos: lista });
}

// Pago a proveedor, admite pagos parciales (no hace falta cancelar toda
// la deuda de una vez).
export async function pagarProveedor(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const { monto, formaPago, fechaPago, numeroRecibo } = req.body;

    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    if (!FORMAS_PAGO.includes(formaPago)) {
        return res.status(400).json({ error: 'Elegí la forma de pago: efectivo, transferencia, tarjeta de crédito o débito' });
    }

    try {
        const pago = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const resultado = await cliente.query(`SELECT saldo FROM proveedores WHERE id = $1 FOR UPDATE`, [id]);
            const proveedor = resultado.rows[0];
            if (!proveedor) {
                throw new ErrorNegocio('El proveedor no existe');
            }
            if (Number(monto) > Number(proveedor.saldo)) {
                throw new ErrorNegocio(
                    `No le debés tanto: el saldo es Gs ${Number(proveedor.saldo).toLocaleString('es-PY')}`
                );
            }

            await cliente.query(`UPDATE proveedores SET saldo = saldo - $2 WHERE id = $1`, [id, monto]);

            const turnoId = await turnoAbiertoDe(cliente, usuarioId);
            const pagoInsertado = await cliente.query(
                `INSERT INTO pagos_proveedor (empresa_id, proveedor_id, usuario_id, turno_id, forma_pago, monto, fecha_pago, numero_recibo)
                 VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8)
                 RETURNING id, creado_en, fecha_pago`,
                [empresaId, id, usuarioId, turnoId, formaPago, monto, fechaPago || null, numeroRecibo || null]
            );

            return {
                id: pagoInsertado.rows[0].id,
                creadoEn: pagoInsertado.rows[0].creado_en,
                fechaPago: pagoInsertado.rows[0].fecha_pago,
                numeroRecibo: numeroRecibo || null,
                proveedorId: id,
                formaPago,
                monto: Number(monto),
                saldoRestante: Number(proveedor.saldo) - Number(monto),
            };
        });

        res.status(201).json(pago);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}
