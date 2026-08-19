import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

function conSaldoDisponible(cliente) {
    return {
        ...cliente,
        saldo_disponible: Number(cliente.linea_credito) - Number(cliente.saldo),
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
    const columnasVentaUrgente = `v.numero_ticket AS recordatorio_numero,
              v.saldo_pendiente AS recordatorio_monto, v.vencimiento AS recordatorio_vencimiento`;

    const resultado = q
        ? await consultaDeEmpresa(
              empresaId,
              `SELECT c.*, ${columnasVentaUrgente}
               FROM clientes c
               ${ventaUrgenteJoin}
               WHERE c.activo = true AND (c.documento LIKE $1 OR unaccent(lower(c.nombre)) LIKE unaccent(lower($2)))
               ORDER BY c.nombre LIMIT 50`,
              [`%${q}%`, `%${q}%`]
          )
        : await consultaDeEmpresa(
              empresaId,
              `SELECT c.*, ${columnasVentaUrgente}
               FROM clientes c
               ${ventaUrgenteJoin}
               WHERE c.activo = true ORDER BY c.nombre LIMIT 100`,
              []
          );

    res.json(resultado.rows.map(conSaldoDisponible));
}

export async function obtenerCliente(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM clientes WHERE id = $1`,
        [id]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json(conSaldoDisponible(resultado.rows[0]));
}

// Extracto de cliente (estado de cuenta): historial de ventas + cobros y
// saldo actual, simetrico al extracto de proveedor.
export async function extractoCliente(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { desde, hasta } = req.query;

    const cliente = await consultaDeEmpresa(empresaId, `SELECT * FROM clientes WHERE id = $1`, [id]);
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

    res.json({
        cliente: conSaldoDisponible(cliente.rows[0]),
        ventas: ventas.rows,
        cobros: cobros.rows,
        ajustesSaldo: ajustesSaldo.rows,
    });
}

export async function crearCliente(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { nombre, documento, telefono, celular, email, direccion, lineaCredito, saldoInicial } = req.body;

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
            `INSERT INTO clientes (empresa_id, nombre, documento, telefono, celular, email, direccion, linea_credito, saldo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), COALESCE($9, 0))
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

    res.status(201).json(conSaldoDisponible(cliente));
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
        if (c.saldoInicial !== undefined && c.saldoInicial !== '' && !(Number(c.saldoInicial) >= 0)) {
            errores.push({ fila, motivo: 'saldo_inicial debe ser 0 o mayor' });
            return;
        }
        validos.push(c);
    });

    let creados = 0;
    let actualizados = 0;

    if (validos.length > 0) {
        await transaccionDeEmpresa(empresaId, async (db) => {
            for (const c of validos) {
                const documento = c.documento ? String(c.documento).trim() : null;
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
                        [
                            existenteId,
                            c.nombre,
                            c.telefono || null,
                            c.celular || null,
                            c.email || null,
                            c.direccion || null,
                            c.lineaCredito === '' || c.lineaCredito === undefined ? null : Number(c.lineaCredito),
                        ]
                    );
                    actualizados++;
                } else {
                    const saldoInicial = c.saldoInicial === '' || c.saldoInicial === undefined ? 0 : Number(c.saldoInicial);
                    const insertado = await db.query(
                        `INSERT INTO clientes (empresa_id, nombre, documento, telefono, celular, email, direccion, linea_credito, saldo)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), $9)
                         RETURNING id`,
                        [
                            empresaId,
                            c.nombre,
                            documento,
                            c.telefono || null,
                            c.celular || null,
                            c.email || null,
                            c.direccion || null,
                            c.lineaCredito === '' || c.lineaCredito === undefined ? null : Number(c.lineaCredito),
                            saldoInicial,
                        ]
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
    const { nombre, documento, telefono, celular, email, direccion, lineaCredito, activo } = req.body;

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
            activo = COALESCE($10, activo)
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [id, empresaId, nombre, documento, telefono, celular, email, direccion, lineaCredito, activo]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json(conSaldoDisponible(resultado.rows[0]));
}
