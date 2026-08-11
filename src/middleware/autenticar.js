import jwt from 'jsonwebtoken';

// Verifica el token que manda el frontend y deja los datos del usuario
// logueado (empresaId, usuarioId, rol) disponibles en req.usuario.
export function autenticar(req, res, next) {
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
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o vencido' });
    }
}
