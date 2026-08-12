// Generador minimo de comandos ESC/POS - a proposito no se usa una libreria
// grande (node-thermal-printer, escpos) porque esas vienen atadas a su
// propio transporte (red/serie/USB directo); aca el envio real lo hace el
// spooler de Windows (ver imprimir.js), asi que solo hace falta el buffer
// de comandos. Referencia: ESC/POS es el protocolo que entienden casi
// todas las impresoras termicas de recibos (Epson, Xprinter, genericas
// compatibles), documentado por Epson pero adoptado como estandar de facto.
const ESC = 0x1b;
const GS = 0x1d;

const INICIALIZAR = Buffer.from([ESC, 0x40]);
const CORTE = Buffer.from([GS, 0x56, 0x00]);
const SALTO_LINEA = Buffer.from([0x0a]);

function negrita(activar) {
    return Buffer.from([ESC, 0x45, activar ? 1 : 0]);
}

function alinear(alineacion) {
    const codigo = { izquierda: 0, centro: 1, derecha: 2 }[alineacion] ?? 0;
    return Buffer.from([ESC, 0x61, codigo]);
}

// Codepage: la mayoria de las termicas genericas usan CP437 o similar por
// defecto, no UTF-8. 'latin1' es la aproximacion mas cercana con Buffer
// nativo de Node para que acentos/ñ salgan razonablemente bien sin sumar
// una dependencia de conversion de codepage - si en la impresora real de
// Mario salen mal, hay que ajustar esto segun el modelo (primer punto a
// revisar en la prueba con hardware real).
function textoBuffer(texto) {
    return Buffer.from(`${texto}\n`, 'latin1');
}

// lineas: [{ texto, negrita: bool, alineacion: 'izquierda'|'centro'|'derecha' }]
function armarBuffer(lineas, { cortar = true } = {}) {
    const partes = [INICIALIZAR];
    let alineacionActual = 'izquierda';
    let negritaActual = false;

    for (const linea of lineas) {
        const quiereAlineacion = linea.alineacion || 'izquierda';
        const quiereNegrita = !!linea.negrita;

        if (quiereAlineacion !== alineacionActual) {
            partes.push(alinear(quiereAlineacion));
            alineacionActual = quiereAlineacion;
        }
        if (quiereNegrita !== negritaActual) {
            partes.push(negrita(quiereNegrita));
            negritaActual = quiereNegrita;
        }
        partes.push(textoBuffer(linea.texto ?? ''));
    }

    partes.push(SALTO_LINEA, SALTO_LINEA, SALTO_LINEA);
    if (cortar) partes.push(CORTE);

    return Buffer.concat(partes);
}

module.exports = { armarBuffer };
