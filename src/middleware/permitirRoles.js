import { tienePermiso } from '../utils/permisos.js';

// Bloquea una ruta a menos que el rol del usuario logueado este en la lista.
// Ej: permitirRoles('dueno', 'encargado') para lo que un cajero no debe tocar.
export function permitirRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.usuario.rol)) {
            return res.status(403).json({ error: 'No tenés permiso para esta acción' });
        }
        next();
    };
}

// Igual que permitirRoles, pero ademas deja pasar a un usuario (tipicamente
// cajero) al que se le concedio ese permiso puntual en usuario_permisos —
// se consulta fresco en cada pedido (no viaja en el JWT), asi conceder o
// revocar un permiso surte efecto en el proximo click, no recien cuando
// esa persona vuelva a loguearse.
export function permitirRolesOPermiso(roles, permiso) {
    return async (req, res, next) => {
        if (roles.includes(req.usuario.rol)) {
            return next();
        }
        const { empresaId, usuarioId } = req.usuario;
        if (await tienePermiso(empresaId, usuarioId, permiso)) {
            return next();
        }
        return res.status(403).json({ error: 'No tenés permiso para esta acción' });
    };
}
