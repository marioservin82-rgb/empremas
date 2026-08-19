// Interpreta un numero escrito con formato local: en Paraguay/planillas de
// Excel en español, el punto suele ser separador de miles ("1.500.000") y
// la coma el decimal ("450,50") - justo al reves de "Number()" de JS, que
// rompe con cualquiera de los dos y devuelve NaN. Usado por las
// importaciones masivas (productos/clientes/proveedores) para no explotar
// con "Error interno" apenas una planilla real trae numeros asi, en vez de
// avisar fila por fila.
export function numeroLocal(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    let texto = String(valor).trim();
    if (texto === '') return null;

    const tieneComa = texto.includes(',');
    const tienePunto = texto.includes('.');

    if (tieneComa && tienePunto) {
        // El separador que aparece mas a la derecha es el decimal; el otro
        // se trata como separador de miles y se descarta.
        const separadorDecimal = texto.lastIndexOf(',') > texto.lastIndexOf('.') ? ',' : '.';
        const separadorMiles = separadorDecimal === ',' ? '.' : ',';
        texto = texto.split(separadorMiles).join('');
        if (separadorDecimal === ',') texto = texto.replace(',', '.');
    } else if (tieneComa) {
        const partes = texto.split(',');
        // Mas de una coma, o una sola seguida de exactamente 3 digitos
        // ("1,500"): es agrupacion de miles, no decimal.
        if (partes.length > 2 || partes[partes.length - 1].length === 3) {
            texto = texto.split(',').join('');
        } else {
            texto = texto.replace(',', '.');
        }
    } else if (tienePunto) {
        const partes = texto.split('.');
        if (partes.length > 2 || partes[partes.length - 1].length === 3) {
            texto = texto.split('.').join('');
        }
    }

    const numero = Number(texto);
    return Number.isNaN(numero) ? NaN : numero;
}
