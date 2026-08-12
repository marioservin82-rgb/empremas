import pool from '../config/db.js';

// Publico y sin autenticar: la pantalla de login lo necesita antes de que
// el usuario inicie sesion. No expone nada sensible, solo el numero de
// soporte de EMPREMAS (la plataforma), configurable desde el panel de
// super-admin.
export async function obtenerSoporte(req, res) {
    const resultado = await pool.query(
        `SELECT whatsapp_soporte FROM configuracion_plataforma LIMIT 1`
    );
    res.json({ whatsappSoporte: resultado.rows[0]?.whatsapp_soporte ?? null });
}
