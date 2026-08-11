import { consultaDeEmpresa } from '../config/db.js';

function conSaldoDisponible(cliente) {
    return {
        ...cliente,
        saldo_disponible: Number(cliente.linea_credito) - Number(cliente.saldo),
    };
}

export async function listarClientes(req, res) {
    const { q } = req.query;
    const { empresaId } = req.usuario;

    const resultado = q
        ? await consultaDeEmpresa(
              empresaId,
              `SELECT * FROM clientes
               WHERE activo = true AND (documento LIKE $1 OR unaccent(lower(nombre)) LIKE unaccent(lower($2)))
               ORDER BY nombre LIMIT 50`,
              [`%${q}%`, `%${q}%`]
          )
        : await consultaDeEmpresa(
              empresaId,
              `SELECT * FROM clientes WHERE activo = true ORDER BY nombre LIMIT 100`,
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

    res.json({ cliente: conSaldoDisponible(cliente.rows[0]), ventas: ventas.rows, cobros: cobros.rows });
}

export async function crearCliente(req, res) {
    const { empresaId } = req.usuario;
    const { nombre, documento, telefono, celular, email, direccion, lineaCredito } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO clientes (empresa_id, nombre, documento, telefono, celular, email, direccion, linea_credito)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0))
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
        ]
    );

    res.status(201).json(conSaldoDisponible(resultado.rows[0]));
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
