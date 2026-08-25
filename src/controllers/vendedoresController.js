import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { rangoDelMes } from '../utils/rangoDelMes.js';

const TIPOS_COMISION = ['porcentaje', 'monto_fijo_unidad'];

export async function listarVendedores(req, res) {
    const { empresaId } = req.usuario;
    const { activo } = req.query;
    const condicion = activo === 'true' ? 'WHERE v.activo = true' : '';
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT v.*, u.nombre AS usuario_nombre FROM vendedores v
         LEFT JOIN usuarios u ON u.id = v.usuario_id
         ${condicion}
         ORDER BY v.activo DESC, v.nombre ASC`,
        []
    );
    res.json(resultado.rows);
}

export async function crearVendedor(req, res) {
    const { empresaId } = req.usuario;
    const { nombre, telefono, tipoComision, valorComision, usuarioId } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (tipoComision && !TIPOS_COMISION.includes(tipoComision)) {
        return res.status(400).json({ error: 'Tipo de comisión inválido' });
    }
    if (valorComision !== undefined && !(Number(valorComision) >= 0)) {
        return res.status(400).json({ error: 'El valor de la comisión debe ser 0 o mayor' });
    }

    // El default de tipo_comision se resuelve en JS, no con COALESCE en el
    // SQL: COALESCE(parametro, 'porcentaje') mezclando un parametro con un
    // literal de texto hace que Postgres infiera el tipo de la expresion
    // como text, y despues falla al insertar eso en una columna ENUM sin
    // cast explicito - un parametro solo (sin COALESCE) si castea bien
    // porque ahi Postgres lo infiere directo de la columna destino.
    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO vendedores (empresa_id, nombre, telefono, tipo_comision, valor_comision, usuario_id)
         VALUES ($1, $2, $3, $4, COALESCE($5, 0::numeric), $6)
         RETURNING *`,
        [empresaId, nombre.trim(), telefono || null, tipoComision || 'porcentaje', valorComision, usuarioId || null]
    );
    res.status(201).json(resultado.rows[0]);
}

// activo:false puede venir junto con reasignarClientesA (UUID de otro
// vendedor activo, o null explicito para "dejar sin asignar") - esa
// eleccion puntual siempre gana sobre la politica configurada en Perfil
// de Empresa. Si activo:false viene SIN esa eleccion, se aplica la
// politica por defecto de la empresa automaticamente.
export async function actualizarVendedor(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, telefono, tipoComision, valorComision, usuarioId, activo, reasignarClientesA } = req.body;

    if (tipoComision && !TIPOS_COMISION.includes(tipoComision)) {
        return res.status(400).json({ error: 'Tipo de comisión inválido' });
    }
    if (valorComision !== undefined && valorComision !== null && !(Number(valorComision) >= 0)) {
        return res.status(400).json({ error: 'El valor de la comisión debe ser 0 o mayor' });
    }

    try {
        const resultado = await transaccionDeEmpresa(empresaId, async (db) => {
            const actualizado = await db.query(
                `UPDATE vendedores SET
                    nombre = COALESCE($3, nombre),
                    telefono = COALESCE($4, telefono),
                    tipo_comision = COALESCE($5, tipo_comision),
                    valor_comision = COALESCE($6, valor_comision),
                    usuario_id = CASE WHEN $7::boolean THEN $8 ELSE usuario_id END,
                    activo = COALESCE($9, activo)
                 WHERE id = $1 AND empresa_id = $2
                 RETURNING *`,
                [
                    id,
                    empresaId,
                    nombre,
                    telefono,
                    tipoComision,
                    valorComision,
                    usuarioId !== undefined,
                    usuarioId || null,
                    activo,
                ]
            );
            if (!actualizado.rows[0]) {
                throw new ErrorNegocio('Vendedor no encontrado');
            }

            // Se desactivo el vendedor: resolver que pasa con sus clientes.
            if (activo === false) {
                if (reasignarClientesA !== undefined) {
                    await db.query(`UPDATE clientes SET vendedor_id = $2 WHERE vendedor_id = $1`, [
                        id,
                        reasignarClientesA || null,
                    ]);
                } else {
                    const empresaFila = await db.query(
                        `SELECT politica_clientes_vendedor_inactivo FROM empresas WHERE id = $1`,
                        [empresaId]
                    );
                    if (empresaFila.rows[0]?.politica_clientes_vendedor_inactivo === 'desasignar') {
                        await db.query(`UPDATE clientes SET vendedor_id = NULL WHERE vendedor_id = $1`, [id]);
                    }
                    // 'mantener' (default): no se toca nada, los clientes
                    // quedan con el vendedor inactivo hasta que el dueño
                    // reasigne.
                }
            }

            return actualizado.rows[0];
        });

        res.json(resultado);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(404).json({ error: error.message });
        }
        throw error;
    }
}

// ---------------------------------------------------------------------
// Comision fija por producto, a nivel empresa (nunca por vendedor).
// ---------------------------------------------------------------------

export async function listarProductosComisionFija(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT pcf.id, pcf.producto_id, pcf.monto, p.nombre AS producto_nombre, p.unidad_medida
         FROM productos_comision_fija pcf
         JOIN productos p ON p.id = pcf.producto_id
         WHERE pcf.empresa_id = $1
         ORDER BY p.nombre ASC`,
        [empresaId]
    );
    res.json(resultado.rows);
}

export async function agregarProductoComisionFija(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { productoId, monto } = req.body;

    if (!productoId || !(Number(monto) >= 0)) {
        return res.status(400).json({ error: 'Elegí un producto y un monto de comisión de 0 o mayor' });
    }

    const producto = await consultaDeEmpresa(
        empresaId,
        `SELECT id FROM productos WHERE id = $1 AND activo = true`,
        [productoId]
    );
    if (!producto.rows[0]) {
        return res.status(400).json({ error: 'El producto no existe' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO productos_comision_fija (empresa_id, producto_id, monto, usuario_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (empresa_id, producto_id) DO UPDATE SET monto = $3
         RETURNING id, producto_id, monto`,
        [empresaId, productoId, monto, usuarioId]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function quitarProductoComisionFija(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    await consultaDeEmpresa(empresaId, `DELETE FROM productos_comision_fija WHERE id = $1 AND empresa_id = $2`, [
        id,
        empresaId,
    ]);
    res.json({ ok: true });
}

// ---------------------------------------------------------------------
// Comision por período, en vivo (no se pre-genera nada - ver Contexto
// del plan: venta_items.comision_monto ya queda congelado por venta, no
// hace falta duplicar ese congelado a nivel de período).
// ---------------------------------------------------------------------

export async function comisionesDelVendedor(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { periodo } = req.query;
    const { desde, hasta } = rangoDelMes(periodo);

    const vendedor = await consultaDeEmpresa(empresaId, `SELECT id, nombre FROM vendedores WHERE id = $1`, [id]);
    if (!vendedor.rows[0]) {
        return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT v.id AS venta_id, v.creado_en, v.tipo_pago, v.saldo_pendiente, v.total AS venta_total,
                p.nombre AS producto_nombre, vi.cantidad, vi.comision_monto,
                (v.tipo_pago <> 'credito' OR v.saldo_pendiente = 0) AS realizada
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id
         JOIN productos p ON p.id = vi.producto_id
         WHERE v.vendedor_id = $1 AND v.anulada = false AND vi.comision_monto > 0
           AND v.creado_en >= $2::date AND v.creado_en < ($3::date + INTERVAL '1 day')
         ORDER BY v.creado_en ASC`,
        [id, desde, hasta]
    );

    const totalGenerado = items.rows.reduce((acumulado, i) => acumulado + Number(i.comision_monto), 0);
    const totalRealizado = items.rows
        .filter((i) => i.realizada)
        .reduce((acumulado, i) => acumulado + Number(i.comision_monto), 0);

    const pagoFila = await consultaDeEmpresa(
        empresaId,
        `SELECT pagado FROM comisiones_vendedor_pagos WHERE empresa_id = $1 AND vendedor_id = $2 AND periodo = $3`,
        [empresaId, id, desde]
    );

    res.json({
        periodo: desde,
        vendedorNombre: vendedor.rows[0].nombre,
        items: items.rows,
        totalGenerado,
        totalRealizado,
        totalPendienteCobro: totalGenerado - totalRealizado,
        pagado: pagoFila.rows[0]?.pagado || false,
    });
}

export async function marcarPagado(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const { periodo, pagado } = req.body;

    if (!periodo) {
        return res.status(400).json({ error: 'Falta el período' });
    }
    const { desde } = rangoDelMes(periodo);

    await consultaDeEmpresa(
        empresaId,
        `INSERT INTO comisiones_vendedor_pagos (empresa_id, vendedor_id, periodo, pagado, pagado_en, usuario_id)
         VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END, $5)
         ON CONFLICT (empresa_id, vendedor_id, periodo)
         DO UPDATE SET pagado = $4, pagado_en = CASE WHEN $4 THEN now() ELSE NULL END`,
        [empresaId, id, desde, !!pagado, usuarioId]
    );

    res.json({ ok: true });
}
