// Express 4 no atrapa errores de funciones async solas: esto reenvia
// cualquier rechazo al middleware de errores en vez de colgar el pedido.
export function asyncHandler(fn) {
    return (req, res, next) => fn(req, res, next).catch(next);
}
