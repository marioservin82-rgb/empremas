import bcrypt from 'bcrypt';
import pool, { consultaDeEmpresa } from '../config/db.js';

// Este controller usa pool directo (no consultaDeEmpresa) para empresas,
// admins_plataforma y pagos_plataforma - ninguna tiene RLS, y el admin de
// plataforma necesita ver TODAS las empresas, no una sola. sucursales SI
// tiene RLS (aislada por app.empresa_actual, una empresa a la vez), asi
// que para su conteo no hay forma de traerlo en el mismo SELECT cruzando
// tenants - se pide aparte, una consultaDeEmpresa por empresa (N+1, pero
// la cantidad de empresas de la plataforma es chica).
async function contarSucursalesActivas(empresaId) {
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT COUNT(*) AS cantidad FROM sucursales WHERE activa = true`,
        []
    );
    return Number(resultado.rows[0].cantidad);
}

export async function cambiarPassword(req, res) {
    const { adminId } = req.admin;
    const { passwordActual, passwordNueva } = req.body;

    if (!passwordNueva || passwordNueva.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const resultado = await pool.query(`SELECT password_hash FROM admins_plataforma WHERE id = $1`, [adminId]);
    const admin = resultado.rows[0];
    if (!admin || !(await bcrypt.compare(passwordActual || '', admin.password_hash))) {
        return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const passwordHash = await bcrypt.hash(passwordNueva, 10);
    await pool.query(`UPDATE admins_plataforma SET password_hash = $2 WHERE id = $1`, [adminId, passwordHash]);
    res.json({ ok: true });
}

export async function yo(req, res) {
    const { adminId } = req.admin;
    const resultado = await pool.query(`SELECT nombre, email FROM admins_plataforma WHERE id = $1`, [adminId]);
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Admin no encontrado' });
    }
    res.json(resultado.rows[0]);
}

export async function listarEmpresas(req, res) {
    const resultado = await pool.query(
        `SELECT e.id, e.razon_social, e.ruc, e.plan, e.estado, e.limite_usuarios, e.limite_sucursales, e.vence_en,
                (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.activo = true) AS usuarios_activos
         FROM empresas e
         ORDER BY e.razon_social ASC`
    );
    const empresas = await Promise.all(
        resultado.rows.map(async (empresa) => ({
            ...empresa,
            sucursales_activas: await contarSucursalesActivas(empresa.id),
        }))
    );
    res.json(empresas);
}

export async function obtenerEmpresa(req, res) {
    const { id } = req.params;

    const empresa = await pool.query(
        `SELECT e.id, e.razon_social, e.ruc, e.plan, e.estado, e.limite_usuarios, e.limite_sucursales, e.vence_en,
                (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.activo = true) AS usuarios_activos
         FROM empresas e
         WHERE e.id = $1`,
        [id]
    );
    if (!empresa.rows[0]) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    empresa.rows[0].sucursales_activas = await contarSucursalesActivas(id);

    const pagos = await pool.query(
        `SELECT p.id, p.monto, p.fecha_pago, p.periodo_desde, p.periodo_hasta, p.notas, a.nombre AS admin_nombre
         FROM pagos_plataforma p
         JOIN admins_plataforma a ON a.id = p.admin_id
         WHERE p.empresa_id = $1
         ORDER BY p.fecha_pago DESC`,
        [id]
    );

    res.json({ ...empresa.rows[0], pagos: pagos.rows });
}

const ESTADOS_VALIDOS = ['prueba', 'activa', 'mora', 'suspendida'];

export async function actualizarEmpresa(req, res) {
    const { id } = req.params;
    const { plan, estado, limiteUsuarios, limiteSucursales, venceEn } = req.body;

    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    if (limiteUsuarios !== undefined && !(Number(limiteUsuarios) >= 1)) {
        return res.status(400).json({ error: 'El límite de usuarios debe ser al menos 1' });
    }
    if (limiteSucursales !== undefined && !(Number(limiteSucursales) >= 1)) {
        return res.status(400).json({ error: 'El límite de sucursales debe ser al menos 1' });
    }

    const resultado = await pool.query(
        `UPDATE empresas SET
            plan = COALESCE($2, plan),
            estado = COALESCE($3, estado),
            limite_usuarios = COALESCE($4, limite_usuarios),
            limite_sucursales = COALESCE($5, limite_sucursales),
            vence_en = COALESCE($6, vence_en)
         WHERE id = $1
         RETURNING id, razon_social, plan, estado, limite_usuarios, limite_sucursales, vence_en`,
        [id, plan, estado, limiteUsuarios, limiteSucursales, venceEn]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json(resultado.rows[0]);
}

// Configuracion global de la plataforma (numero de soporte de EMPREMAS,
// mostrado a todos los tenants). Tabla de una sola fila - GET trae esa
// fila (o null si todavia no existe ninguna) y PATCH la actualiza si
// existe o la crea si es la primera vez que se guarda.
export async function obtenerConfiguracion(req, res) {
    const resultado = await pool.query(`SELECT whatsapp_soporte FROM configuracion_plataforma LIMIT 1`);
    res.json({ whatsappSoporte: resultado.rows[0]?.whatsapp_soporte ?? null });
}

export async function actualizarConfiguracion(req, res) {
    const { whatsappSoporte } = req.body;

    const existente = await pool.query(`SELECT id FROM configuracion_plataforma LIMIT 1`);
    const resultado = existente.rows[0]
        ? await pool.query(
              `UPDATE configuracion_plataforma SET whatsapp_soporte = $2, actualizado_en = now()
               WHERE id = $1 RETURNING whatsapp_soporte`,
              [existente.rows[0].id, whatsappSoporte || null]
          )
        : await pool.query(
              `INSERT INTO configuracion_plataforma (whatsapp_soporte) VALUES ($1) RETURNING whatsapp_soporte`,
              [whatsappSoporte || null]
          );

    res.json({ whatsappSoporte: resultado.rows[0].whatsapp_soporte });
}

// Registra un pago y, de paso, actualiza vence_en al periodo cubierto y
// reactiva la cuenta si estaba en mora/suspendida - pagar es la señal
// mas clara de que hay que devolverle el acceso.
export async function registrarPago(req, res) {
    const { adminId } = req.admin;
    const { id } = req.params;
    const { monto, periodoDesde, periodoHasta, notas } = req.body;

    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    if (!periodoDesde || !periodoHasta) {
        return res.status(400).json({ error: 'Indicá el período que cubre el pago' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const empresa = await cliente.query(`SELECT id, estado FROM empresas WHERE id = $1 FOR UPDATE`, [id]);
        if (!empresa.rows[0]) {
            await cliente.query('ROLLBACK');
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        const pago = await cliente.query(
            `INSERT INTO pagos_plataforma (empresa_id, admin_id, monto, periodo_desde, periodo_hasta, notas)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, monto, fecha_pago, periodo_desde, periodo_hasta, notas`,
            [id, adminId, monto, periodoDesde, periodoHasta, notas || null]
        );

        const estadoActual = empresa.rows[0].estado;
        const nuevoEstado = estadoActual === 'mora' || estadoActual === 'suspendida' ? 'activa' : estadoActual;

        await cliente.query(`UPDATE empresas SET vence_en = $2, estado = $3 WHERE id = $1`, [
            id,
            periodoHasta,
            nuevoEstado,
        ]);

        await cliente.query('COMMIT');
        res.status(201).json(pago.rows[0]);
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}
