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

// GS ! n - tamaño de letra. Sin este comando la impresora usa su fuente
// mas chica por defecto (lo que Mario vio como "sale muy chica") - se deja
// todo el ticket en doble alto (mismo ancho, asi no se rompen los
// renglones largos con precio) salvo que una linea pida otra cosa.
const TAMANO_NORMAL = Buffer.from([GS, 0x21, 0x00]);
const TAMANO_ALTO = Buffer.from([GS, 0x21, 0x01]);
const TAMANO_GRANDE = Buffer.from([GS, 0x21, 0x11]);

function tamano(nivel) {
    if (nivel === 'grande') return TAMANO_GRANDE;
    if (nivel === 'normal') return TAMANO_NORMAL;
    return TAMANO_ALTO;
}

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

// lineas: [{ texto, negrita: bool, alineacion: 'izquierda'|'centro'|'derecha', tamano: 'normal'|'alto'|'grande' }]
function armarBuffer(lineas, { cortar = true } = {}) {
    const partes = [INICIALIZAR, TAMANO_ALTO];
    let alineacionActual = 'izquierda';
    let negritaActual = false;
    let tamanoActual = 'alto';

    for (const linea of lineas) {
        const quiereAlineacion = linea.alineacion || 'izquierda';
        const quiereNegrita = !!linea.negrita;
        const quiereTamano = linea.tamano || 'alto';

        if (quiereAlineacion !== alineacionActual) {
            partes.push(alinear(quiereAlineacion));
            alineacionActual = quiereAlineacion;
        }
        if (quiereNegrita !== negritaActual) {
            partes.push(negrita(quiereNegrita));
            negritaActual = quiereNegrita;
        }
        if (quiereTamano !== tamanoActual) {
            partes.push(tamano(quiereTamano));
            tamanoActual = quiereTamano;
        }
        partes.push(textoBuffer(linea.texto ?? ''));
    }

    // Mas espacio en blanco antes del corte que lo estrictamente necesario:
    // Mario reportó que la guillotina cortaba pegada al texto - con solo 3
    // saltos de linea el corte le entraba encima del final del ticket en su
    // impresora real.
    partes.push(TAMANO_NORMAL);
    for (let i = 0; i < 6; i += 1) partes.push(SALTO_LINEA);
    if (cortar) partes.push(CORTE);

    return Buffer.concat(partes);
}

module.exports = { armarBuffer };
