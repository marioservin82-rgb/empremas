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

// ESC M n - tipo de letra. La mayoria de las termicas traen dos fuentes
// grabadas: Fuente A (la que usa por defecto, mas grande/ancha) y Fuente B
// (mas chica y compacta, pensada para tickets con mucho detalle). El
// tamaño (GS ! de mas abajo) escala la fuente que este activa - no cambia
// cual es. Mario reportó que en tamaño normal igual salía "grande": era la
// Fuente A. Con la Fuente B de base, el mismo tamaño "normal" imprime mas
// chico.
const FUENTE_B = Buffer.from([ESC, 0x4d, 0x01]);

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
//
// Tamaño por defecto 'alto': con la Fuente A (la que usaba antes de
// FUENTE_B de arriba) doble alto salía "muy grande" y tamaño normal salía
// "muy chico". Con la Fuente B (mas compacta) de base, Mario probo tamaño
// normal, dijo que se leia bien pero que se podia agrandar "un poquito" -
// como ESC/POS no tiene una escala intermedia (solo 1x, 2x, 3x...), el
// siguiente escalon es doble alto, que con esta fuente de base ya no es
// tan grande como antes.
function armarBuffer(lineas, { cortar = true } = {}) {
    const partes = [INICIALIZAR, FUENTE_B, TAMANO_ALTO];
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
