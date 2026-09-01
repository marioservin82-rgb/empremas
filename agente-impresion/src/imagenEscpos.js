// Impresion de una imagen (el QR de verificacion del Recibo de Cobro) en
// modo raster bit a bit - comando ESC/POS estandar (GS v 0), soportado
// practicamente por cualquier termica compatible (Epson, Xprinter,
// generica). No hay forma de probar esto sin la impresora fisica de
// Mario - la primera prueba real en papel la tiene que hacer el.
//
// pngjs (pura JS, sin bindings nativos) para decodificar el PNG - se
// eligio a proposito por eso: este agente se empaqueta a un .exe con pkg
// (ver package.json), y una libreria con binarios nativos (sharp, por
// ejemplo) complica o rompe ese empaquetado.
const { PNG } = require('pngjs');

const GS = 0x1d;

// dataUrlPng: "data:image/png;base64,...." (mismo QR ya generado en el
// frontend con la libreria "qrcode", el mismo que se ve en pantalla/A4 -
// no se regenera nada aca, solo se convierte a bits).
function bufferImagenEscpos(dataUrlPng) {
    const base64 = String(dataUrlPng).replace(/^data:image\/png;base64,/, '');
    const png = PNG.sync.read(Buffer.from(base64, 'base64'));
    const { width, height, data } = png; // RGBA, 4 bytes por pixel, fila por fila

    // Ancho en bytes, redondeado hacia arriba a multiplo de 8 (relleno en
    // blanco a la derecha si hace falta) - el comando empaqueta 8 puntos
    // por byte, una fila tiene que entrar en un numero entero de bytes.
    const anchoBytes = Math.ceil(width / 8);
    const bitmap = Buffer.alloc(anchoBytes * height, 0x00);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alfa = data[i + 3];
            // Un QR ya nace en blanco y negro puro (sin escala de grises
            // real) - un umbral simple de luminancia alcanza, sin
            // dithering. Un pixel transparente (fuera del margen del PNG,
            // si lo hubiera) cuenta como fondo blanco, nunca como punto.
            const luminancia = (r + g + b) / 3;
            const esNegro = alfa > 128 && luminancia < 128;
            if (esNegro) {
                const indiceByte = y * anchoBytes + Math.floor(x / 8);
                const bit = 7 - (x % 8);
                bitmap[indiceByte] |= 1 << bit;
            }
        }
    }

    // GS v 0 m xL xH yL yH d1...dk - m=0 (modo normal, sin escalar)
    const xL = anchoBytes & 0xff;
    const xH = (anchoBytes >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;
    const cabecera = Buffer.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]);

    return Buffer.concat([cabecera, bitmap]);
}

module.exports = { bufferImagenEscpos };
