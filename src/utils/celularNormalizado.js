// Mismo criterio que frontend/lib/whatsapp.js: numero paraguayo con 595 y
// sin el 0 inicial, para que "0981123456" y "+595981123456" resuelvan al
// mismo cliente en vez de crear una ficha duplicada.
export function celularNormalizado(celular) {
    if (!celular) return null;
    const soloNumeros = String(celular).replace(/\D/g, '');
    if (!soloNumeros) return null;
    return soloNumeros.startsWith('595') ? soloNumeros : `595${soloNumeros.replace(/^0/, '')}`;
}
