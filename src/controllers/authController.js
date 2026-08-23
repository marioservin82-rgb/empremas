import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

function firmarToken(usuario) {
    return jwt.sign(
        {
            usuarioId: usuario.id,
            empresaId: usuario.empresa_id,
            rol: usuario.rol,
            sucursalId: usuario.sucursal_id,
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// El dueno elige registrarse con email O telefono (no los dos
// obligatorios) - muchos dueños de comercio revisan poco el email pero
// usan WhatsApp a diario. Se normaliza el telefono a solo digitos (mismo
// criterio que linkWhatsapp en el frontend) para que el login de despues
// lo encuentre sin importar como lo haya escrito ("0981 234 567" vs
// "0981234567").
function normalizarTelefono(valor) {
    const digitos = valor ? valor.replace(/\D/g, '') : '';
    return digitos || null;
}

// Da de alta una empresa nueva junto con su primer usuario (el dueño).
// Es el único lugar donde se crea una empresa sin tener ya una sesión.
export async function registrarEmpresa(req, res) {
    const { razonSocial, ruc, nombreDueno, email, telefono, password, codigoReferido } = req.body;

    if (!razonSocial || !ruc || !nombreDueno || !password) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    const telefonoNormalizado = normalizarTelefono(telefono);
    if (!email && !telefonoNormalizado) {
        return res.status(400).json({ error: 'Indicá un email o un teléfono para registrarte' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        // Programa de referidos: si vino un codigo, se busca el contador
        // aliado dueño de ese codigo (sin RLS, no hace falta contexto de
        // empresa). Un codigo vacio, mal tipeado o de un contador
        // desactivado NUNCA frena el alta - simplemente queda sin
        // vincular, como si no se hubiera puesto nada.
        let contadorId = null;
        if (codigoReferido) {
            const contador = await cliente.query(
                `SELECT id FROM contadores_aliados WHERE upper(codigo_referido) = upper($1) AND activo = true`,
                [codigoReferido.trim()]
            );
            contadorId = contador.rows[0]?.id || null;
        }

        // El mismo dato que se usa para registrarse (telefono o email) se
        // guarda tambien en la empresa - asi el panel de super-admin ya lo
        // ve sin que el dueño tenga que volver a cargarlo en Perfil de
        // Empresa.
        const empresa = await cliente.query(
            `INSERT INTO empresas (razon_social, ruc, telefono, email, contador_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [razonSocial, ruc, telefonoNormalizado, email || null, contadorId]
        );
        const empresaId = empresa.rows[0].id;

        // clientes tiene RLS: hace falta esto antes de insertar en esa tabla,
        // aunque usuarios (sin RLS) no lo necesite.
        await cliente.query("SELECT set_config('app.empresa_actual', $1, true)", [empresaId]);

        // Toda empresa arranca con una sucursal (aunque no tenga
        // multi_sucursal_habilitado) - asi el resto del sistema (stock,
        // turnos) siempre resuelve contra una sucursal real.
        const sucursal = await cliente.query(
            `INSERT INTO sucursales (empresa_id, nombre) VALUES ($1, 'Casa Central') RETURNING id`,
            [empresaId]
        );
        const sucursalId = sucursal.rows[0].id;

        const passwordHash = await bcrypt.hash(password, 10);
        const usuario = await cliente.query(
            `INSERT INTO usuarios (empresa_id, sucursal_id, nombre, email, telefono, password_hash, rol)
             VALUES ($1, $2, $3, $4, $5, $6, 'dueno') RETURNING id, empresa_id, sucursal_id, rol`,
            [empresaId, sucursalId, nombreDueno, email || null, telefonoNormalizado, passwordHash]
        );

        // Toda venta necesita un comprador; este es el que se usa cuando no
        // se elige un cliente puntual (venta de mostrador, anonima).
        await cliente.query(
            `INSERT INTO clientes (empresa_id, nombre, es_generico) VALUES ($1, 'Consumidor Final', true)`,
            [empresaId]
        );

        await cliente.query('COMMIT');

        const token = firmarToken(usuario.rows[0]);
        res.status(201).json({ token });
    } catch (error) {
        await cliente.query('ROLLBACK');
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una empresa o usuario con ese RUC/email/teléfono' });
        }
        throw error;
    } finally {
        cliente.release();
    }
}

export async function login(req, res) {
    // identificador: email o telefono, segun con que se haya registrado
    // quien inicia sesion - se acepta cualquiera de los dos sin que el
    // usuario tenga que saber cual eligio en su momento.
    const { identificador, password } = req.body;
    if (!identificador || !password) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    const identificadorTelefono = normalizarTelefono(identificador);

    const resultado = await pool.query(
        `SELECT u.id, u.empresa_id, u.sucursal_id, u.rol, u.password_hash, u.activo, e.estado AS empresa_estado
         FROM usuarios u
         JOIN empresas e ON e.id = u.empresa_id
         WHERE u.email = $1 OR u.telefono = $2`,
        [identificador, identificadorTelefono]
    );
    const usuario = resultado.rows[0];

    if (!usuario || !usuario.activo || !(await bcrypt.compare(password, usuario.password_hash))) {
        return res.status(401).json({ error: 'Email/teléfono o contraseña incorrectos' });
    }
    if (usuario.empresa_estado === 'suspendida') {
        return res.status(401).json({ error: 'Tu cuenta está suspendida — contactate con EMPREMAS para regularizar tu pago' });
    }

    const token = firmarToken(usuario);
    res.json({ token });
}
