import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// Login del panel de administracion de EMPREMAS - completamente separado
// del login de usuarios/tenants (authController.js). admins_plataforma no
// tiene relacion con ninguna empresa.
export async function loginAdmin(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const resultado = await pool.query(
        `SELECT id, nombre, password_hash, activo FROM admins_plataforma WHERE email = $1`,
        [email]
    );
    const admin = resultado.rows[0];

    if (!admin || !admin.activo || !(await bcrypt.compare(password, admin.password_hash))) {
        return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const token = jwt.sign(
        { adminId: admin.id, tipo: 'admin_plataforma' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.json({ token });
}
