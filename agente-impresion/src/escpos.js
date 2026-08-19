// Generador minimo de comandos ESC/POS - a proposito no se usa una libreria
// grande (node-thermal-printer, escpos) porque esas vienen atadas a su
// propio transporte (red/serie/USB directo); aca el envio real lo hace el
// spooler de Windows (ver imprimir.js), asi que solo hace falta el buffer
// de comandos. Referencia: ESC/POS es el protocolo que entienden casi
// todas las impresoras termicas de recibos (Epson, Xprinter, genericas
// compatibles), documentado por Epson pero adoptado como estandar de facto.
const iconv = require('iconv-lite');

const ESC = 0x1b;
const GS = 0x1d;

const INICIALIZAR = Buffer.from([ESC, 0x40]);
const CORTE = Buffer.from([GS, 0x56, 0x00]);
const SALTO_LINEA = Buffer.from([0x0a]);

// ESC t n - selecciona la tabla de caracteres (codepage) con la que la
// impresora va a interpretar los bytes de texto que le llegan. Sin este
// comando, usa la que trae de fabrica - en la gran mayoria de las termicas
// genericas, CP437 (EEUU/Europa estandar) - que en el rango 0x80-0xFF (justo
// donde viven las vocales acentuadas y la ñ) mapea a simbolos totalmente
// distintos que CP1252/Latin-1. Ese desfasaje es lo que rompia "Condición"
// en "Condici<n" y se comia la Ñ de "BLANCO": el texto llegaba bien desde
// el backend, pero nunca se le avisaba a la impresora bajo que tabla
// leerlo. n=16 (0x10) es "WPC1252" en la tabla de codepages de Epson, la
// que replican casi todas las termicas ESC/POS compatibles (genericas,
// Xprinter, Gainscha, etc.) - si en la impresora real de Mario el acento
// sigue mal con este valor, el siguiente a probar es n=19 (PC858).
const CODEPAGE_CP1252 = 16;
const SELECCIONAR_CODEPAGE = Buffer.from([ESC, 0x74, CODEPAGE_CP1252]);

// ESC M n - tipo de letra. La mayoria de las termicas traen dos fuentes
// grabadas: Fuente A (la de fabrica, mas nitida - cada caracter ocupa mas
// puntos de la cabeza termica) y Fuente B (mas chica y compacta, pensada
// para entrar mas texto por linea a costa de verse mas tosca/pixelada).
// Mario comparo un ticket propio contra uno de un competidor en la misma
// impresora y el de EMPREMAS se veia con bordes irregulares - eso encaja
// con Fuente B. Se vuelve a Fuente A por nitidez; el tamaño (GS ! de mas
// abajo) sigue en doble alto como ya se habia afinado antes, pero al ser
// Fuente A de base el resultado va a salir mas grande que antes - es la
// primera cosa a confirmar imprimiendo en papel real.
const FUENTE_A = Buffer.from([ESC, 0x4d, 0x00]);

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

// La tabla que se le pide a la impresora arriba (CODEPAGE_CP1252) tiene que
// coincidir con la tabla usada para convertir el texto a bytes aca - si no,
// aunque la impresora ya sepa "leer en CP1252", se le seguirian mandando
// bytes de otra tabla. iconv-lite (en vez del 'latin1' nativo de Node, que
// no cubre bien todo el rango 0x80-0x9F de CP1252) hace esa conversion.
function textoBuffer(texto) {
    return iconv.encode(`${texto}\n`, 'cp1252');
}

// Ancho de linea en caracteres con la Fuente A a ancho normal (GS ! con
// multiplicador de ancho x1) en un rollo de 80mm - varia un poco segun el
// modelo, 42 es el valor conservador dentro del rango tipico (42-48) para
// no pasarse de largo en ningun caso. Con tamaño 'grande' (ancho x2) entran
// la mitad de caracteres por linea fisica.
const ANCHO_BASE = 42;

function anchoDeLinea(nivelTamano) {
    return nivelTamano === 'grande' ? Math.floor(ANCHO_BASE / 2) : ANCHO_BASE;
}

// Corta un texto largo en varias lineas sin partir palabras a la mitad
// (antes esto lo terminaba haciendo la propia impresora, a lo bruto, por
// cantidad de caracteres) - arma renglones agregando palabra por palabra
// mientras entren, y solo si una sola palabra ya es mas larga que el ancho
// completo (raro: un codigo largo pegado, por ejemplo) la parte a la
// fuerza como ultimo recurso, para no trabarse.
function envolverTexto(texto, ancho) {
    const palabras = String(texto).split(' ').filter((p) => p !== '');
    const lineas = [];
    let actual = '';

    for (const palabra of palabras) {
        const candidata = actual ? `${actual} ${palabra}` : palabra;
        if (candidata.length <= ancho) {
            actual = candidata;
            continue;
        }
        if (actual) lineas.push(actual);
        if (palabra.length > ancho) {
            let resto = palabra;
            while (resto.length > ancho) {
                lineas.push(resto.slice(0, ancho));
                resto = resto.slice(ancho);
            }
            actual = resto;
        } else {
            actual = palabra;
        }
    }
    if (actual) lineas.push(actual);
    return lineas.length > 0 ? lineas : [''];
}

// lineas: [{ texto, negrita: bool, alineacion: 'izquierda'|'centro'|'derecha', tamano: 'normal'|'alto'|'grande' }]
function armarBuffer(lineas, { cortar = true } = {}) {
    const partes = [INICIALIZAR, SELECCIONAR_CODEPAGE, FUENTE_A, TAMANO_ALTO];
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
        for (const sublinea of envolverTexto(linea.texto ?? '', anchoDeLinea(quiereTamano))) {
            partes.push(textoBuffer(sublinea));
        }
    }

    // Espacio antes del corte: la linea de firma (agregada en cada ticket,
    // ver Recibo.js/ReciboCobro.js/PresupuestoImprimible.js) ya deja algo
    // de aire de por si - estos saltos son el margen extra para que la
    // guillotina no corte pegada al texto.
    partes.push(TAMANO_NORMAL);
    for (let i = 0; i < 4; i += 1) partes.push(SALTO_LINEA);
    if (cortar) partes.push(CORTE);

    return Buffer.concat(partes);
}

module.exports = { armarBuffer };
