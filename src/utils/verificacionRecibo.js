import crypto from 'crypto';

// Codigo de verificacion del recibo de cobro (para el QR): no es solo el
// numero de recibo (cualquiera podria inventar uno) - es un HMAC sobre los
// datos reales y estables del cobro (monto, cliente, fecha, y a que
// venta(s) se aplico) con una clave que solo el servidor conoce. Si
// alguien altera a mano el monto en el papel, el codigo ya impreso sigue
// representando el monto ORIGINAL: al recalcularlo desde lo guardado en
// la base y compararlo, la diferencia queda expuesta.
//
// Reusa JWT_SECRET con un sufijo propio (no una clave nueva a configurar
// en Render aparte) - misma idea de "un secreto de app ya establecido",
// namespaced para que este codigo nunca sea utilizable como si fuera un
// JWT real ni viceversa.
function claveSecreta() {
    return `${process.env.JWT_SECRET}:recibo-verificacion`;
}

// aplicaciones: [{ ventaId, montoAplicado }] - se ordena antes de armar el
// texto canonico para que el orden en que se insertaron las filas en la
// base (irrelevante) nunca cambie el resultado del calculo.
export function calcularCodigoVerificacion({ id, empresaId, clienteId, monto, creadoEn, aplicaciones }) {
    const aplicacionesCanonicas = [...(aplicaciones || [])]
        .map((a) => `${a.ventaId}:${Number(a.montoAplicado).toFixed(2)}`)
        .sort()
        .join(',');
    const textoCanonico = [
        id,
        empresaId,
        clienteId,
        Number(monto).toFixed(2),
        new Date(creadoEn).toISOString(),
        aplicacionesCanonicas,
    ].join('|');

    // 16 caracteres hex = 64 bits - de sobra contra un intento de
    // adivinar el codigo a mano o por fuerza bruta, y corto para que
    // entre comodo en un QR de 80mm.
    return crypto.createHmac('sha256', claveSecreta()).update(textoCanonico).digest('hex').slice(0, 16);
}
