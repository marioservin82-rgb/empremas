import { consultaDeEmpresa } from '../config/db.js';

// Chequeo puntual de un permiso extra concedido a un usuario (tipicamente
// cajero) via usuario_permisos — para logica de negocio que no es un
// simple gate de ruta (ej. ocultar precio_costo, saltear el PIN de
// anulacion). Se consulta fresca, nunca cacheada en el JWT.
export async function tienePermiso(empresaId, usuarioId, permiso) {
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT 1 FROM usuario_permisos WHERE usuario_id = $1 AND permiso = $2`,
        [usuarioId, permiso]
    );
    return !!resultado.rows[0];
}
