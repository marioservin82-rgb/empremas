import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

const ESTADOS_VALIDOS = ['recibido', 'en_reparacion', 'listo_para_entrega', 'entregado', 'cancelado'];

// Sin restriccion de sucursal (a diferencia de la agenda diaria de citas):
// una reparacion queda abierta dias o semanas, el personal necesita ver
// todas las de la empresa, no solo las de un dia/sucursal puntual.
export async function listarReparaciones(req, res) {
    const { empresaId } = req.usuario;
    const estado = req.query.estado || null;
    const q = (req.query.q || '').trim();

    const condiciones = ['1=1'];
    const valores = [];

    if (estado) {
        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }
        valores.push(estado);
        condiciones.push(`r.estado = $${valores.length}`);
    }

    if (q) {
        valores.push(`%${q}%`);
        const iTexto = valores.length;
        valores.push(q);
        const iNumero = valores.length;
        condiciones.push(
            `(cl.nombre ILIKE $${iTexto} OR cl.documento ILIKE $${iTexto} OR cl.celular ILIKE $${iTexto} OR CAST(r.numero AS TEXT) = $${iNumero})`
        );
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT r.*, cl.nombre AS cliente_nombre, cl.celular AS cliente_celular, cl.documento AS cliente_documento
         FROM reparaciones r
         JOIN clientes cl ON cl.id = r.cliente_id
         WHERE ${condiciones.join(' AND ')}
         ORDER BY r.creado_en DESC
         LIMIT 200`,
        valores
    );

    res.json(resultado.rows);
}

export async function obtenerReparacion(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT r.*, cl.nombre AS cliente_nombre, cl.documento AS cliente_documento, cl.celular AS cliente_celular,
                cl.direccion AS cliente_direccion,
                u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
         FROM reparaciones r
         JOIN clientes cl ON cl.id = r.cliente_id
         JOIN usuarios u ON u.id = r.usuario_id
         JOIN sucursales s ON s.id = r.sucursal_id
         WHERE r.id = $1`,
        [id]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Reparación no encontrada' });
    }

    // Ventas ya vinculadas a esta reparacion (trazabilidad, ver
    // ventas.reparacion_id) - una reparacion puede cobrarse mas de una
    // vez (ej. un anticipo y despues el saldo), no hay limite de a proposito.
    const ventas = await consultaDeEmpresa(
        empresaId,
        `SELECT id, numero_ticket, total, tipo_pago, creado_en FROM ventas WHERE reparacion_id = $1 ORDER BY creado_en ASC`,
        [id]
    );

    res.json({ ...resultado.rows[0], ventas: ventas.rows });
}

export async function crearReparacion(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const {
        clienteId, tipoEquipo, marca, modelo, numeroSerie, accesorios,
        estadoRecibido, comentarioCliente, notaInterna,
    } = req.body;

    if (!clienteId) {
        return res.status(400).json({ error: 'Elegí a qué cliente pertenece el equipo' });
    }
    if (!tipoEquipo || !String(tipoEquipo).trim()) {
        return res.status(400).json({ error: 'Indicá el tipo de equipo (celular, electrodoméstico, etc.)' });
    }
    if (!estadoRecibido || !String(estadoRecibido).trim()) {
        return res.status(400).json({ error: 'Describí el estado del equipo al recibirlo' });
    }

    try {
        const reparacion = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const clienteResultado = await cliente.query(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
            if (!clienteResultado.rows[0]) {
                throw new ErrorNegocio('El cliente no existe');
            }

            // Numeracion correlativa, mismo patron que ticket/recibo/presupuesto:
            // el UPDATE bloquea la fila de la empresa, asi dos recepciones al
            // mismo tiempo nunca sacan el mismo numero.
            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_reparacion = siguiente_numero_reparacion + 1
                 WHERE id = $1
                 RETURNING siguiente_numero_reparacion - 1 AS numero`,
                [empresaId]
            );
            const numero = numeroResultado.rows[0].numero;

            const insertado = await cliente.query(
                `INSERT INTO reparaciones (
                    empresa_id, sucursal_id, cliente_id, numero, tipo_equipo, marca, modelo,
                    numero_serie, accesorios, estado_recibido, comentario_cliente, nota_interna, usuario_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING *`,
                [
                    empresaId,
                    sucursalId,
                    clienteId,
                    numero,
                    String(tipoEquipo).trim(),
                    marca || null,
                    modelo || null,
                    numeroSerie || null,
                    accesorios || null,
                    String(estadoRecibido).trim(),
                    comentarioCliente || null,
                    notaInterna || null,
                    usuarioId,
                ]
            );
            return insertado.rows[0];
        });
        res.status(201).json(reparacion);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Los 5 estados son todos editables a mano en cualquier momento - a
// diferencia de una cita (donde "atendida" SOLO se marca al cobrar), acá
// el cobro es independiente de la entrega (ver crearVenta/reparacionId),
// asi que no hace falta ningun estado "protegido" ni orden obligatorio.
export async function actualizarEstadoReparacion(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { estado } = req.body;

    if (!ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE reparaciones SET estado = $2, actualizado_en = now() WHERE id = $1 RETURNING *`,
        [id, estado]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Reparación no encontrada' });
    }
    res.json(resultado.rows[0]);
}

// Para corregir un dato cargado al recibir el equipo (ej. un error de
// tipeo en la marca) - no toca cliente/numero/estado.
export async function actualizarReparacion(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { tipoEquipo, marca, modelo, numeroSerie, accesorios, estadoRecibido, comentarioCliente, notaInterna } =
        req.body;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE reparaciones SET
            tipo_equipo = COALESCE($2, tipo_equipo),
            marca = COALESCE($3, marca),
            modelo = COALESCE($4, modelo),
            numero_serie = COALESCE($5, numero_serie),
            accesorios = COALESCE($6, accesorios),
            estado_recibido = COALESCE($7, estado_recibido),
            comentario_cliente = COALESCE($8, comentario_cliente),
            nota_interna = COALESCE($9, nota_interna),
            actualizado_en = now()
         WHERE id = $1
         RETURNING *`,
        [id, tipoEquipo, marca, modelo, numeroSerie, accesorios, estadoRecibido, comentarioCliente, notaInterna]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Reparación no encontrada' });
    }
    res.json(resultado.rows[0]);
}
