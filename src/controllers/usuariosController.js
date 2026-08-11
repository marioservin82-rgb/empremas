import bcrypt from 'bcrypt';
import pool, { consulta, consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';

const PIN_VALIDO = /^\d{4}$/;
const ROLES_ASIGNABLES = ['encargado', 'cajero'];
const PERMISOS_VALIDOS = [
    'ver_costos',
    'ver_reportes',
    'gestionar_inventario',
    'gestionar_compras',
    'gestionar_clientes',
    'anular_sin_pin',
];

// usuarios NO tiene RLS (ver schema.sql), asi que cualquier consulta que no
// use directamente el usuarioId del propio JWT (como aca) tiene que filtrar
// por empresa_id a mano - la primera capa de aislamiento, sin la segunda.
// sucursales SI tiene RLS, asi que cualquier query que la toque (aunque
// sea un JOIN) tiene que pasar por consultaDeEmpresa para setear el
// contexto de tenant - si no, RLS la filtra en silencio y devuelve vacio/
// null aunque el WHERE este bien escrito.

export async function yo(req, res) {
    const { empresaId, usuarioId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT u.nombre, u.email, u.rol, s.nombre AS sucursal_nombre
         FROM usuarios u
         LEFT JOIN sucursales s ON s.id = u.sucursal_id
         WHERE u.id = $1 AND u.empresa_id = $2`,
        [usuarioId, empresaId]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(resultado.rows[0]);
}

export async function listarUsuarios(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.creado_en, u.sucursal_id, s.nombre AS sucursal_nombre,
                COALESCE(
                    (SELECT json_agg(up.permiso) FROM usuario_permisos up WHERE up.usuario_id = u.id),
                    '[]'::json
                ) AS permisos
         FROM usuarios u
         LEFT JOIN sucursales s ON s.id = u.sucursal_id
         WHERE u.empresa_id = $1
         ORDER BY u.creado_en ASC`,
        [empresaId]
    );
    res.json(resultado.rows);
}

export async function crearUsuario(req, res) {
    const { empresaId } = req.usuario;
    const { nombre, email, password, rol, sucursalId } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!ROLES_ASIGNABLES.includes(rol)) {
        return res.status(400).json({ error: 'El rol debe ser encargado o cajero' });
    }

    const limiteResultado = await pool.query(
        `SELECT e.limite_usuarios, (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.activo = true) AS activos
         FROM empresas e WHERE e.id = $1`,
        [empresaId]
    );
    const { limite_usuarios: limiteUsuarios, activos } = limiteResultado.rows[0];
    if (Number(activos) >= Number(limiteUsuarios)) {
        return res.status(403).json({ error: `Tu plan permite hasta ${limiteUsuarios} usuarios activos` });
    }

    // Si no se indica sucursal, va a la primera/unica de la empresa. Si se
    // indica, se valida que sea de esta empresa (no de otra).
    let sucursalIdFinal = sucursalId;
    if (sucursalIdFinal) {
        const sucursal = await consultaDeEmpresa(empresaId, `SELECT id FROM sucursales WHERE id = $1 AND empresa_id = $2`, [
            sucursalIdFinal,
            empresaId,
        ]);
        if (!sucursal.rows[0]) {
            return res.status(400).json({ error: 'Esa sucursal no existe' });
        }
    } else {
        const sucursal = await consultaDeEmpresa(
            empresaId,
            `SELECT id FROM sucursales WHERE empresa_id = $1 ORDER BY creado_en ASC LIMIT 1`,
            [empresaId]
        );
        sucursalIdFinal = sucursal.rows[0]?.id ?? null;
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const resultado = await consulta(
            `INSERT INTO usuarios (empresa_id, sucursal_id, nombre, email, password_hash, rol)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, nombre, email, rol, activo, creado_en, sucursal_id`,
            [empresaId, sucursalIdFinal, nombre, email, passwordHash, rol]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
        }
        throw error;
    }
}

export async function actualizarUsuario(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;
    const { nombre, rol, activo, password, sucursalId } = req.body;

    if (id === usuarioId) {
        return res.status(400).json({ error: 'No podés editarte a vos mismo desde acá' });
    }
    if (rol !== undefined && !ROLES_ASIGNABLES.includes(rol)) {
        return res.status(400).json({ error: 'El rol debe ser encargado o cajero' });
    }
    if (password !== undefined && password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (sucursalId !== undefined) {
        const sucursal = await consultaDeEmpresa(empresaId, `SELECT id FROM sucursales WHERE id = $1 AND empresa_id = $2`, [
            sucursalId,
            empresaId,
        ]);
        if (!sucursal.rows[0]) {
            return res.status(400).json({ error: 'Esa sucursal no existe' });
        }
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const resultado = await consulta(
        `UPDATE usuarios SET
            nombre = COALESCE($3, nombre),
            rol = COALESCE($4, rol),
            activo = COALESCE($5, activo),
            password_hash = COALESCE($6, password_hash),
            sucursal_id = COALESCE($7, sucursal_id)
         WHERE id = $1 AND empresa_id = $2
         RETURNING id, nombre, email, rol, activo, creado_en, sucursal_id`,
        [id, empresaId, nombre, rol, activo, passwordHash, sucursalId]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(resultado.rows[0]);
}

// El propio dueno/encargado fija o cambia su PIN numerico (4 digitos),
// usado despues para autorizar acciones sensibles como anular una venta.
export async function fijarMiPin(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { pin } = req.body;

    if (!PIN_VALIDO.test(pin || '')) {
        return res.status(400).json({ error: 'El PIN debe ser de 4 dígitos numéricos' });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await consultaDeEmpresa(
        empresaId,
        `UPDATE usuarios SET pin_hash = $2 WHERE id = $1`,
        [usuarioId, pinHash]
    );

    res.json({ ok: true });
}

// Para que la pantalla de anulacion sepa si el usuario logueado (si es
// dueno/encargado) ya tiene PIN configurado, o si hace falta pedirselo a
// otro supervisor que sí lo tenga.
export async function miEstadoPin(req, res) {
    const { empresaId, usuarioId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT pin_hash IS NOT NULL AS tiene_pin FROM usuarios WHERE id = $1`,
        [usuarioId]
    );

    res.json({ tienePin: resultado.rows[0]?.tiene_pin ?? false });
}

// Permisos extra por empleado (encima de los 3 roles fijos) — ver
// permiso_extra en el schema y permitirRolesOPermiso en el middleware.
export async function listarPermisos(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT permiso FROM usuario_permisos WHERE usuario_id = $1`,
        [id]
    );
    res.json(resultado.rows.map((r) => r.permiso));
}

// Reemplaza el set completo de permisos extra de un usuario — mas simple
// para un formulario de checkboxes que ir togglando de a uno.
export async function actualizarPermisos(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { permisos } = req.body;

    if (!Array.isArray(permisos) || permisos.some((p) => !PERMISOS_VALIDOS.includes(p))) {
        return res.status(400).json({ error: 'Lista de permisos inválida' });
    }

    const usuario = await consultaDeEmpresa(empresaId, `SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2`, [
        id,
        empresaId,
    ]);
    if (!usuario.rows[0]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await transaccionDeEmpresa(empresaId, async (cliente) => {
        await cliente.query(`DELETE FROM usuario_permisos WHERE usuario_id = $1`, [id]);
        for (const permiso of permisos) {
            await cliente.query(
                `INSERT INTO usuario_permisos (empresa_id, usuario_id, permiso) VALUES ($1, $2, $3)`,
                [empresaId, id, permiso]
            );
        }
    });

    res.json({ permisos });
}
