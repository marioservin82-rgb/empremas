import { consultaDeEmpresa } from '../config/db.js';

// Trae todas las novedades publicadas, con "leida" calculada para el
// usuario puntual que pide la lista (no para la empresa entera - un
// dueño y sus cajeros leen cada uno por su cuenta).
export async function listarNovedades(req, res) {
    const { empresaId, usuarioId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT n.id, n.titulo, n.descripcion, n.categoria, n.creado_en,
                (nl.id IS NOT NULL) AS leida
         FROM novedades n
         LEFT JOIN novedades_leidas nl ON nl.novedad_id = n.id AND nl.usuario_id = $1
         ORDER BY n.creado_en DESC`,
        [usuarioId]
    );
    res.json(resultado.rows);
}

export async function marcarLeida(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id } = req.params;

    await consultaDeEmpresa(
        empresaId,
        `INSERT INTO novedades_leidas (empresa_id, novedad_id, usuario_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (novedad_id, usuario_id) DO NOTHING`,
        [empresaId, id, usuarioId]
    );
    res.json({ ok: true });
}
