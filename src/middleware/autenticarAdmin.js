import jwt from 'jsonwebtoken';

// Analogo a autenticar.js, pero para el panel de administracion de
// EMPREMAS (Mario, dueno de la plataforma) - un token de tenant normal
// NUNCA debe servir aca, por eso se exige la forma distinta del payload
// (tipo: 'admin_plataforma', sin empresaId/rol/sucursalId) en vez de solo
// confiar en que la firma sea valida.
export function autenticarAdmin(req, res, next) {
    const encabezado = req.headers.authorization;
    if (!encabezado?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    try {
        const token = encabezado.slice('Bearer '.length);
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.tipo !== 'admin_plataforma') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        req.admin = payload;
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o vencido' });
    }
}
