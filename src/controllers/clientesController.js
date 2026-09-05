import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { numeroLocal } from '../utils/numeroLocal.js';
import { rangoDelMes } from '../utils/rangoDelMes.js';

// Categoria de fidelizacion de un cliente: nunca se guarda, siempre se
// recalcula comparando el volumen de compra del mes (contado + credito +
// mayorista) contra las categorias activas de la empresa, quedandose con
// la de monto_minimo mas alto que el volumen iguala o supera.
// ejecutarConsulta: (sql, params) => Promise<{rows}> - consultaDeEmpresa ya
// atado a la empresa, o cliente.query de una transaccion en curso.
export async function categoriaYVolumenDeCliente(ejecutarConsulta, empresaId, clienteId, mes) {
    const { desde, hasta } = rangoDelMes(mes);
    const [volumen, categorias] = await Promise.all([
        ejecutarConsulta(
            `SELECT COALESCE(SUM(total), 0) AS total FROM ventas
             WHERE cliente_id = $1 AND anulada = false AND creado_en >= $2::date AND creado_en < ($3::date + INTERVAL '1 day')`,
            [clienteId, desde, hasta]
        ),
        ejecutarConsulta(
            `SELECT * FROM categorias_cliente WHERE empresa_id = $1 AND activo = true ORDER BY monto_minimo DESC`,
            [empresaId]
        ),
    ]);
    const volumenMes = Number(volumen.rows[0].total);
    const categoria = categorias.rows.find((c) => volumenMes >= Number(c.monto_minimo)) || null;
    return { volumenMes, categoria };
}

function conSaldoDisponibleYCategoria(cliente, categoria) {
    const lineaCreditoEfectiva = Number(cliente.linea_credito) + Number(categoria?.beneficio_linea_credito_extra || 0);
    const { vendedor_nombre_join, ...resto } = cliente;
    return {
        ...resto,
        // Se manda tambien el beneficio de mayorista/descuento (no solo el
        // nombre) para que Vender pueda mostrar el precio ya con el
        // beneficio aplicado ANTES de confirmar la venta - el cajero
        // necesita saber cuanto cobrar de verdad, no solo despues del
        // hecho.
        categoriaCliente: categoria
            ? {
                  id: categoria.id,
                  nombre: categoria.nombre,
                  beneficioMayoristaAutomatico: categoria.beneficio_mayorista_automatico,
                  beneficioDescuentoAdicionalPct: Number(categoria.beneficio_descuento_adicional_pct || 0),
              }
            : null,
        // Modulo de Vendedores por comision: quien atiende habitualmente a
        // este cliente - Vender lo usa para atribuir la venta sin que el
        // cajero tenga que elegir nada (ver crearVenta).
        vendedorAsignado: cliente.vendedor_id ? { id: cliente.vendedor_id, nombre: vendedor_nombre_join } : null,
        volumenMes: Number(cliente.volumen_mes ?? 0),
        saldo_disponible: lineaCreditoEfectiva - Number(cliente.saldo),
    };
}

export async function listarClientes(req, res) {
    const { q } = req.query;
    const { empresaId } = req.usuario;

    // La venta a credito impaga mas urgente de cada cliente (la mas vencida
    // si hay varias atrasadas, o la mas proxima si ninguna vencio aun) - la
    // usa el boton "Recordar pago" para saber que plantilla corresponde,
    // sin tener que pedir el extracto completo de cada cliente.
    const ventaUrgenteJoin = `
        LEFT JOIN LATERAL (
            SELECT numero_ticket, saldo_pendiente, vencimiento FROM ventas
            WHERE cliente_id = c.id AND tipo_pago = 'credito' AND anulada = false
              AND saldo_pendiente > 0 AND vencimiento IS NOT NULL
            ORDER BY vencimiento ASC LIMIT 1
        ) v ON true`;
    // Volumen de compra del mes en curso, traido con una subconsulta
    // escalar en la misma fila (en vez de una categoria por cliente,
    // aparte) - evita N+1: las categorias de la empresa se traen una sola
    // vez, aparte, y la clasificacion de cada fila se resuelve en JS.
    const columnasVentaUrgente = `v.numero_ticket AS recordatorio_numero,
              v.saldo_pendiente AS recordatorio_monto, v.vencimiento AS recordatorio_vencimiento,
              vend.nombre AS vendedor_nombre_join,
              COALESCE((
                  SELECT SUM(total) FROM ventas
                  WHERE cliente_id = c.id AND anulada = false AND creado_en >= date_trunc('month', now())
              ), 0) AS volumen_mes`;
    const vendedorJoin = `LEFT JOIN vendedores vend ON vend.id = c.vendedor_id`;

    const [resultado, categorias] = await Promise.all([
        q
            ? consultaDeEmpresa(
                  empresaId,
                  `SELECT c.*, ${columnasVentaUrgente}
                   FROM clientes c
                   ${ventaUrgenteJoin}
                   ${vendedorJoin}
                   WHERE c.activo = true AND (c.documento LIKE $1 OR unaccent(lower(c.nombre)) LIKE unaccent(lower($2)))
                   ORDER BY c.nombre LIMIT 50`,
                  [`%${q}%`, `%${q}%`]
              )
            : consultaDeEmpresa(
                  empresaId,
                  `SELECT c.*, ${columnasVentaUrgente}
                   FROM clientes c
                   ${ventaUrgenteJoin}
                   ${vendedorJoin}
                   WHERE c.activo = true ORDER BY c.nombre LIMIT 100`,
                  []
              ),
        consultaDeEmpresa(
            empresaId,
            `SELECT * FROM categorias_cliente WHERE empresa_id = $1 AND activo = true ORDER BY monto_minimo DESC`,
            [empresaId]
        ),
    ]);

    res.json(
        resultado.rows.map((c) => {
            const volumenMes = Number(c.volumen_mes);
            const categoria = categorias.rows.find((cat) => volumenMes >= Number(cat.monto_minimo)) || null;
            return conSaldoDisponibleYCategoria(c, categoria);
        })
    );
}

export async function obtenerCliente(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT c.*, vend.nombre AS vendedor_nombre_join FROM clientes c
         LEFT JOIN vendedores vend ON vend.id = c.vendedor_id
         WHERE c.id = $1`,
        [id]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const { categoria, volumenMes } = await categoriaYVolumenDeCliente(
        (sql, params) => consultaDeEmpresa(empresaId, sql, params),
        empresaId,
        id
    );
    res.json(conSaldoDisponibleYCategoria({ ...resultado.rows[0], volumen_mes: volumenMes }, categoria));
}

// Extracto de cliente (estado de cuenta): historial de ventas + cobros y
// saldo actual, simetrico al extracto de proveedor.
export async function extractoCliente(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { desde, hasta } = req.query;

    const cliente = await consultaDeEmpresa(
        empresaId,
        `SELECT c.*, vend.nombre AS vendedor_nombre_join FROM clientes c
         LEFT JOIN vendedores vend ON vend.id = c.vendedor_id
         WHERE c.id = $1`,
        [id]
    );
    if (!cliente.rows[0]) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // hasta es inclusive: hasta el final de ese dia (mismo criterio que
    // listarVentas).
    const condicionesFecha = [];
    const valoresFecha = [];
    if (desde) {
        valoresFecha.push(desde);
        condicionesFecha.push(`creado_en >= $${valoresFecha.length + 1}::date`);
    }
    if (hasta) {
        valoresFecha.push(hasta);
        condicionesFecha.push(`creado_en < ($${valoresFecha.length + 1}::date + INTERVAL '1 day')`);
    }
    const whereFecha = condicionesFecha.length > 0 ? `AND ${condicionesFecha.join(' AND ')}` : '';
    // Misma condicion pero con el alias "v", necesario abajo por el JOIN
    // con documentos_electronicos (que tambien tiene su propio creado_en).
    const whereFechaVenta = whereFecha.replace(/creado_en/g, 'v.creado_en');

    const ventas = await consultaDeEmpresa(
        empresaId,
        `SELECT v.id, v.tipo_pago, v.total, v.saldo_pendiente, v.vencimiento, v.creado_en,
                v.numero_ticket, de.numero_formateado AS de_numero_formateado
         FROM ventas v
         LEFT JOIN documentos_electronicos de ON de.venta_id = v.id AND de.estado = 'aprobado'
         WHERE v.cliente_id = $1 ${whereFechaVenta} ORDER BY v.creado_en DESC LIMIT 200`,
        [id, ...valoresFecha]
    );

    const cobros = await consultaDeEmpresa(
        empresaId,
        `SELECT id, numero_recibo, monto, creado_en FROM cobros WHERE cliente_id = $1 ${whereFecha} ORDER BY creado_en DESC LIMIT 200`,
        [id, ...valoresFecha]
    );

    const ajustesSaldo = await consultaDeEmpresa(
        empresaId,
        `SELECT id, saldo_anterior, saldo_nuevo, diferencia, motivo, creado_en
         FROM ajustes_saldo_cliente WHERE cliente_id = $1 ${whereFecha} ORDER BY creado_en DESC LIMIT 200`,
        [id, ...valoresFecha]
    );

    // Agregado por producto (no por venta): responde directo "que compro
    // este cliente en tal periodo" - anulada=false porque una venta
    // anulada se devolvio, no cuenta como compra real.
    const productos = await consultaDeEmpresa(
        empresaId,
        `SELECT vi.producto_id, p.nombre AS producto_nombre, p.unidad_medida,
                SUM(vi.cantidad) AS cantidad_total,
                SUM(vi.subtotal) AS total_gastado,
                COUNT(DISTINCT vi.venta_id) AS veces_comprado
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id AND v.cliente_id = $1 AND v.anulada = false ${whereFechaVenta}
         JOIN productos p ON p.id = vi.producto_id
         GROUP BY vi.producto_id, p.nombre, p.unidad_medida
         ORDER BY total_gastado DESC
         LIMIT 500`,
        [id, ...valoresFecha]
    );

    const { categoria, volumenMes } = await categoriaYVolumenDeCliente(
        (sql, params) => consultaDeEmpresa(empresaId, sql, params),
        empresaId,
        id
    );

    res.json({
        cliente: conSaldoDisponibleYCategoria({ ...cliente.rows[0], volumen_mes: volumenMes }, categoria),
        ventas: ventas.rows,
        cobros: cobros.rows,
        ajustesSaldo: ajustesSaldo.rows,
        productos: productos.rows,
    });
}

const CLASIFICACIONES_SIFEN = ['auto', 'b2b', 'b2c', 'b2g', 'b2f'];

export async function crearCliente(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { nombre, documento, telefono, celular, email, direccion, lineaCredito, saldoInicial, vendedorId, fechaNacimiento } = req.body;
    const clasificacionSifen = CLASIFICACIONES_SIFEN.includes(req.body.clasificacionSifen)
        ? req.body.clasificacionSifen
        : 'auto';

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (saldoInicial !== undefined && !(Number(saldoInicial) >= 0)) {
        return res.status(400).json({ error: 'El saldo inicial debe ser 0 o mayor' });
    }

    // Si viene saldoInicial (migracion de un cliente que ya debia antes de
    // pasarse a EMPREMAS), se crea el cliente Y se deja registrado el
    // ajuste en el mismo request - asi el saldo con el que arranca queda
    // igual de auditado que cualquier otro ajuste posterior.
    const cliente = await transaccionDeEmpresa(empresaId, async (db) => {
        const insertado = await db.query(
            `INSERT INTO clientes (empresa_id, nombre, documento, telefono, celular, email, direccion, linea_credito, saldo, vendedor_id, clasificacion_sifen, fecha_nacimiento)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0::numeric), COALESCE($9, 0::numeric), $10, $11, $12)
             RETURNING *`,
            [
                empresaId,
                nombre,
                documento || null,
                telefono || null,
                celular || null,
                email || null,
                direccion || null,
                lineaCredito,
                saldoInicial,
                vendedorId || null,
                clasificacionSifen,
                fechaNacimiento || null,
            ]
        );
        const nuevoCliente = insertado.rows[0];

        if (Number(saldoInicial) > 0) {
            await db.query(
                `INSERT INTO ajustes_saldo_cliente (empresa_id, cliente_id, usuario_id, saldo_anterior, saldo_nuevo, diferencia, motivo)
                 VALUES ($1, $2, $3, 0, $4, $4, 'Saldo inicial (migración)')`,
                [empresaId, nuevoCliente.id, usuarioId, saldoInicial]
            );
        }

        return nuevoCliente;
    });

    res.status(201).json(conSaldoDisponibleYCategoria(cliente, null));
}

// Importacion masiva desde CSV (el parseo del archivo se hace en el
// frontend, esto recibe filas ya como objetos). Matchea por documento (el
// dato estable entre sistemas, a diferencia del nombre): si existe un
// cliente con ese documento en la empresa, lo actualiza (nombre/contacto/
// linea de credito, nunca el saldo - eso sigue yendo por Ajustar saldo
// para no perder el rastro auditado); si no, crea uno nuevo, con el mismo
// saldoInicial+ajuste auditado que ya usa crearCliente. Filas invalidas
// se reportan pero no frenan al resto.
export async function importarClientes(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { clientes } = req.body;

    if (!Array.isArray(clientes) || clientes.length === 0) {
        return res.status(400).json({ error: 'No hay clientes para importar' });
    }

    const validos = [];
    const errores = [];
    clientes.forEach((c, indice) => {
        const fila = indice + 2; // fila 1 es el encabezado del CSV
        if (!c.nombre || !String(c.nombre).trim()) {
            errores.push({ fila, motivo: 'Falta el nombre' });
            return;
        }
        const saldoInicialNum = numeroLocal(c.saldoInicial);
        if (Number.isNaN(saldoInicialNum)) {
            errores.push({ fila, motivo: `"${c.saldoInicial}" no es un número válido para saldo_inicial` });
            return;
        }
        if (saldoInicialNum !== null && !(saldoInicialNum >= 0)) {
            errores.push({ fila, motivo: 'saldo_inicial debe ser 0 o mayor' });
            return;
        }
        const lineaCreditoNum = numeroLocal(c.lineaCredito);
        if (Number.isNaN(lineaCreditoNum)) {
            errores.push({ fila, motivo: `"${c.lineaCredito}" no es un número válido para linea_credito` });
            return;
        }
        validos.push(c);
    });

    let creados = 0;
    let actualizados = 0;

    if (validos.length > 0) {
      try {
        await transaccionDeEmpresa(empresaId, async (db) => {
            for (const c of validos) {
                const documento = c.documento ? String(c.documento).trim() : null;
                const lineaCredito = numeroLocal(c.lineaCredito);
                let existenteId = null;
                if (documento) {
                    const resultado = await db.query(`SELECT id FROM clientes WHERE documento = $1`, [documento]);
                    existenteId = resultado.rows[0]?.id ?? null;
                }

                if (existenteId) {
                    await db.query(
                        `UPDATE clientes SET
                            nombre = COALESCE($2, nombre),
                            telefono = COALESCE($3, telefono),
                            celular = COALESCE($4, celular),
                            email = COALESCE($5, email),
                            direccion = COALESCE($6, direccion),
                            linea_credito = COALESCE($7, linea_credito)
                         WHERE id = $1`,
                        [existenteId, c.nombre, c.telefono || null, c.celular || null, c.email || null, c.direccion || null, lineaCredito]
                    );
                    actualizados++;
                } else {
                    const saldoInicial = numeroLocal(c.saldoInicial) ?? 0;
                    const insertado = await db.query(
                        `INSERT INTO clientes (empresa_id, nombre, documento, telefono, celular, email, direccion, linea_credito, saldo)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0::numeric), $9)
                         RETURNING id`,
                        [empresaId, c.nombre, documento, c.telefono || null, c.celular || null, c.email || null, c.direccion || null, lineaCredito, saldoInicial]
                    );
                    if (saldoInicial > 0) {
                        await db.query(
                            `INSERT INTO ajustes_saldo_cliente (empresa_id, cliente_id, usuario_id, saldo_anterior, saldo_nuevo, diferencia, motivo)
                             VALUES ($1, $2, $3, 0, $4, $4, 'Saldo inicial (migración)')`,
                            [empresaId, insertado.rows[0].id, usuarioId, saldoInicial]
                        );
                    }
                    creados++;
                }
            }
        });
      } catch (error) {
        console.error('Error en importarClientes:', error);
        return res.status(400).json({
            error: 'No se pudo completar la importación — revisá que los números tengan formato válido e intentá de nuevo.',
        });
      }
    }

    res.json({ creados, actualizados, errores });
}

// Ajuste manual de saldo (mismo espiritu que ajustarInventario en
// productosController.js): corrige clientes.saldo a un valor puntual, con
// motivo obligatorio, dejando rastro en ajustes_saldo_cliente. Pensado
// para migrar deuda de un sistema anterior o corregir un error de carga.
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
            const clienteResultado = await db.query(`SELECT nombre, saldo FROM clientes WHERE id = $1 FOR UPDATE`, [id]);
            const cliente = clienteResultado.rows[0];
            if (!cliente) {
                throw new ErrorNegocio('El cliente no existe');
            }

            const saldoAnterior = Number(cliente.saldo);
            const diferencia = Number(saldoNuevo) - saldoAnterior;

            await db.query(`UPDATE clientes SET saldo = $2 WHERE id = $1`, [id, saldoNuevo]);

            const ajusteInsertado = await db.query(
                `INSERT INTO ajustes_saldo_cliente (empresa_id, cliente_id, usuario_id, saldo_anterior, saldo_nuevo, diferencia, motivo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, creado_en`,
                [empresaId, id, usuarioId, saldoAnterior, saldoNuevo, diferencia, motivo.trim()]
            );

            return {
                id: ajusteInsertado.rows[0].id,
                creadoEn: ajusteInsertado.rows[0].creado_en,
                clienteId: id,
                clienteNombre: cliente.nombre,
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
        `SELECT * FROM ajustes_saldo_cliente WHERE cliente_id = $1 ORDER BY creado_en DESC LIMIT 100`,
        [id]
    );

    res.json(resultado.rows);
}

export async function actualizarCliente(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, documento, telefono, celular, email, direccion, lineaCredito, activo, vendedorId, fechaNacimiento } = req.body;
    const clasificacionSifen = CLASIFICACIONES_SIFEN.includes(req.body.clasificacionSifen)
        ? req.body.clasificacionSifen
        : undefined;

    // vendedor_id se asigna directo (sin COALESCE): es nulleable a
    // proposito, para poder desasignar mandando "" - la pantalla de
    // edicion siempre reenvia el formulario completo, no es un PATCH
    // parcial de un campo suelto (mismo criterio que los beneficios de
    // categorias_cliente). Solo se omite del UPDATE si directamente no
    // vino en el body (undefined), para no romper otros llamadores de
    // este mismo endpoint (ej. el toggle de activo/inactivo).
    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE clientes SET
            nombre = COALESCE($3, nombre),
            documento = COALESCE($4, documento),
            telefono = COALESCE($5, telefono),
            celular = COALESCE($6, celular),
            email = COALESCE($7, email),
            direccion = COALESCE($8, direccion),
            linea_credito = COALESCE($9, linea_credito),
            activo = COALESCE($10, activo),
            vendedor_id = CASE WHEN $11::boolean THEN $12 ELSE vendedor_id END,
            clasificacion_sifen = COALESCE($13, clasificacion_sifen),
            fecha_nacimiento = COALESCE($14, fecha_nacimiento)
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [
            id,
            empresaId,
            nombre,
            documento,
            telefono,
            celular,
            email,
            direccion,
            lineaCredito,
            activo,
            vendedorId !== undefined,
            vendedorId || null,
            clasificacionSifen ?? null,
            fechaNacimiento || null,
        ]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const vendedorFila = resultado.rows[0].vendedor_id
        ? await consultaDeEmpresa(empresaId, `SELECT nombre FROM vendedores WHERE id = $1`, [resultado.rows[0].vendedor_id])
        : null;
    const { categoria, volumenMes } = await categoriaYVolumenDeCliente(
        (sql, params) => consultaDeEmpresa(empresaId, sql, params),
        empresaId,
        id
    );
    res.json(
        conSaldoDisponibleYCategoria(
            { ...resultado.rows[0], volumen_mes: volumenMes, vendedor_nombre_join: vendedorFila?.rows[0]?.nombre },
            categoria
        )
    );
}

// ---------------------------------------------------------------------
// Categorias de fidelizacion (dueño-only: define nombre, rango y
// beneficios - politica financiera del negocio, mismo criterio que
// Gastos/Perfil de Empresa).
// ---------------------------------------------------------------------

export async function listarCategorias(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM categorias_cliente WHERE empresa_id = $1 ORDER BY monto_minimo DESC`,
        [empresaId]
    );
    res.json(resultado.rows);
}

export async function crearCategoria(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { nombre, montoMinimo, beneficioMayoristaAutomatico, beneficioDescuentoAdicionalPct, beneficioLineaCreditoExtra } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (montoMinimo !== undefined && !(Number(montoMinimo) >= 0)) {
        return res.status(400).json({ error: 'El monto mínimo debe ser 0 o mayor' });
    }
    if (beneficioDescuentoAdicionalPct !== undefined && beneficioDescuentoAdicionalPct !== null) {
        const pct = Number(beneficioDescuentoAdicionalPct);
        if (!(pct >= 0) || pct > 100) {
            return res.status(400).json({ error: 'El descuento adicional debe estar entre 0 y 100' });
        }
    }
    if (beneficioLineaCreditoExtra !== undefined && beneficioLineaCreditoExtra !== null && !(Number(beneficioLineaCreditoExtra) >= 0)) {
        return res.status(400).json({ error: 'El crédito extra debe ser 0 o mayor' });
    }

    try {
        const resultado = await consultaDeEmpresa(
            empresaId,
            `INSERT INTO categorias_cliente (empresa_id, nombre, monto_minimo, beneficio_mayorista_automatico, beneficio_descuento_adicional_pct, beneficio_linea_credito_extra, usuario_id)
             VALUES ($1, $2, COALESCE($3, 0::numeric), COALESCE($4, false), $5, $6, $7)
             RETURNING *`,
            [
                empresaId,
                nombre.trim(),
                montoMinimo,
                beneficioMayoristaAutomatico,
                beneficioDescuentoAdicionalPct || null,
                beneficioLineaCreditoExtra || null,
                usuarioId,
            ]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        }
        throw error;
    }
}

export async function actualizarCategoria(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, montoMinimo, beneficioMayoristaAutomatico, beneficioDescuentoAdicionalPct, beneficioLineaCreditoExtra, activo } = req.body;

    if (montoMinimo !== undefined && montoMinimo !== null && !(Number(montoMinimo) >= 0)) {
        return res.status(400).json({ error: 'El monto mínimo debe ser 0 o mayor' });
    }
    if (beneficioDescuentoAdicionalPct !== undefined && beneficioDescuentoAdicionalPct !== null) {
        const pct = Number(beneficioDescuentoAdicionalPct);
        if (!(pct >= 0) || pct > 100) {
            return res.status(400).json({ error: 'El descuento adicional debe estar entre 0 y 100' });
        }
    }

    // beneficio_descuento_adicional_pct/beneficio_linea_credito_extra se
    // asignan directo (sin COALESCE): son nulleables a proposito, para que
    // el dueno pueda apagar un beneficio mandando null - la pantalla de
    // edicion siempre reenvia el formulario completo, no es un PATCH
    // parcial de un campo suelto.
    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE categorias_cliente SET
            nombre = COALESCE($3, nombre),
            monto_minimo = COALESCE($4, monto_minimo),
            beneficio_mayorista_automatico = COALESCE($5, beneficio_mayorista_automatico),
            beneficio_descuento_adicional_pct = $6,
            beneficio_linea_credito_extra = $7,
            activo = COALESCE($8, activo)
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [
            id,
            empresaId,
            nombre,
            montoMinimo,
            beneficioMayoristaAutomatico,
            beneficioDescuentoAdicionalPct || null,
            beneficioLineaCreditoExtra || null,
            activo,
        ]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.json(resultado.rows[0]);
}

// Cuenta cuantos clientes activos caen en cada categoria hoy - misma
// subconsulta escalar de volumen + comparacion en JS que listarClientes,
// para no repetir un query por cliente.
export async function reporteCategoriasCliente(req, res) {
    const { empresaId } = req.usuario;

    const [clientes, categorias] = await Promise.all([
        consultaDeEmpresa(
            empresaId,
            `SELECT COALESCE((
                 SELECT SUM(total) FROM ventas
                 WHERE cliente_id = c.id AND anulada = false AND creado_en >= date_trunc('month', now())
             ), 0) AS volumen_mes
             FROM clientes c WHERE c.activo = true AND c.es_generico = false`,
            []
        ),
        consultaDeEmpresa(
            empresaId,
            `SELECT * FROM categorias_cliente WHERE empresa_id = $1 AND activo = true ORDER BY monto_minimo DESC`,
            [empresaId]
        ),
    ]);

    const conteos = new Map(categorias.rows.map((c) => [c.id, 0]));
    let sinCategoria = 0;
    for (const fila of clientes.rows) {
        const volumenMes = Number(fila.volumen_mes);
        const categoria = categorias.rows.find((c) => volumenMes >= Number(c.monto_minimo));
        if (categoria) {
            conteos.set(categoria.id, conteos.get(categoria.id) + 1);
        } else {
            sinCategoria++;
        }
    }

    res.json({
        categorias: categorias.rows.map((c) => ({ id: c.id, nombre: c.nombre, cantidadClientes: conteos.get(c.id) })),
        sinCategoria,
    });
}

// Productos mas comprados historicamente por ESTE cliente puntual -
// distinto de "productos asociados" (que es sobre el producto en
// general). Sin gate de rol: el cajero lo necesita en Vender.
export async function productosFrecuentesDeCliente(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT p.id, p.nombre, p.codigo_barras, p.unidad_medida,
                p.precio_contado, p.precio_credito, p.precio_mayorista,
                COUNT(DISTINCT vi.venta_id) AS veces_comprado
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id AND v.cliente_id = $1 AND v.anulada = false
         JOIN productos p ON p.id = vi.producto_id AND p.activo = true
         GROUP BY p.id
         ORDER BY veces_comprado DESC
         LIMIT 5`,
        [id]
    );

    res.json(resultado.rows);
}

// Clientes que cumplen años en el rango elegido - para que el negocio les
// ofrezca algo especial ese día (mismo espiritu que Recordar pago: solo
// arma la lista y el mensaje, nunca envia nada solo). Se resuelve en JS
// (no en SQL) para evitar el problema de mes/dia "dando la vuelta" al año
// (ej. hoy 28/dic, "esta semana" incluye 2/ene) y el mismo desfasaje de
// zona horaria ya documentado en otras partes de la app (extractoCliente) -
// se trabaja todo en UTC, igual que fecha_nacimiento quedo guardado.
export async function clientesCumpleanos(req, res) {
    const { empresaId } = req.usuario;
    const rango = ['hoy', 'mes'].includes(req.query.rango) ? req.query.rango : 'semana';
    const limiteDias = rango === 'hoy' ? 0 : rango === 'mes' ? 31 : 7;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT id, nombre, celular, fecha_nacimiento FROM clientes
         WHERE activo = true AND fecha_nacimiento IS NOT NULL`,
        []
    );

    // "Hoy" mismo criterio que resumenDia/listarCitas (default en UTC) -
    // ?fecha= opcional para poder probar/consultar otro dia puntual.
    const fechaBase = req.query.fecha ? new Date(`${req.query.fecha}T00:00:00Z`) : new Date();
    const hoyUTC = new Date(Date.UTC(fechaBase.getUTCFullYear(), fechaBase.getUTCMonth(), fechaBase.getUTCDate()));

    const conProximoCumple = resultado.rows
        .map((c) => {
            const nacimiento = new Date(c.fecha_nacimiento);
            const mes = nacimiento.getUTCMonth();
            const dia = nacimiento.getUTCDate();
            let proximo = new Date(Date.UTC(hoyUTC.getUTCFullYear(), mes, dia));
            if (proximo < hoyUTC) proximo = new Date(Date.UTC(hoyUTC.getUTCFullYear() + 1, mes, dia));
            const diasFaltan = Math.round((proximo - hoyUTC) / 86400000);
            return {
                id: c.id,
                nombre: c.nombre,
                celular: c.celular,
                fechaNacimiento: c.fecha_nacimiento,
                diasFaltan,
                cumpleHoy: diasFaltan === 0,
                edadCumple: proximo.getUTCFullYear() - nacimiento.getUTCFullYear(),
            };
        })
        .filter((c) => c.diasFaltan <= limiteDias)
        .sort((a, b) => a.diasFaltan - b.diasFaltan);

    res.json(conProximoCumple);
}
