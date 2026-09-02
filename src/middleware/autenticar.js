import jwt from 'jsonwebtoken';
import { consultaDeEmpresa } from '../config/db.js';

// Verifica el token que manda el frontend y deja los datos del usuario
// logueado (empresaId, usuarioId, rol) disponibles en req.usuario.
export async function autenticar(req, res, next) {
    const encabezado = req.headers.authorization;
    if (!encabezado?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    try {
        const token = encabezado.slice('Bearer '.length);
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        // Un token de admin de plataforma (ver autenticarAdmin.js) firma con
        // el mismo JWT_SECRET pero tiene una forma distinta (tipo en vez de
        // empresaId) - sin este chequeo, pasaría la verificación de firma
        // igual y llegaría a los controllers con empresaId undefined.
        if (payload.tipo === 'admin_plataforma') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        req.usuario = payload;

        // Acceso transversal: cada usuario queda atado a UNA sucursal fija
        // desde el login (payload.sucursalId), salvo el dueño - el panel le
        // ofrece un selector para "trabajar" en cualquier sucursal de su
        // propia empresa sin necesitar una cuenta aparte por sucursal. Esa
        // elección viaja en este header en cada pedido y, si es válida
        // (existe, está activa, y es de ESTA empresa - nunca la de otro
        // negocio aunque alguien mande un UUID ajeno a mano), reemplaza acá
        // la sucursal fija del token para el resto de este único pedido.
        // Sin el header, o si no es dueño, o si no valida: sigue exactamente
        // igual que hoy - cero cambio de comportamiento.
        // sucursales tiene RLS (FORCE ROW LEVEL SECURITY) - un pool.query
        // crudo sin fijar app.empresa_actual primero devuelve SIEMPRE cero
        // filas (no un error), así que hay que pasar por consultaDeEmpresa
        // para que la validación pueda encontrar la fila de verdad.
        const sucursalElegida = req.headers['x-sucursal-activa'];
        if (payload.rol === 'dueno' && sucursalElegida && sucursalElegida !== payload.sucursalId) {
            const fila = await consultaDeEmpresa(
                payload.empresaId,
                `SELECT id FROM sucursales WHERE id = $1 AND activa = true`,
                [sucursalElegida]
            );
            if (fila.rows[0]) {
                req.usuario = { ...payload, sucursalId: sucursalElegida };
            }
        }

        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o vencido' });
    }
}
