// Subida de fotos a Cloudinary (plan gratuito) - la única pieza de
// almacenamiento de archivos de todo EMPREMAS. Se usa para la galería de
// servicios del módulo de Reservas públicas. El SDK toma las credenciales
// de las variables de entorno CLOUDINARY_* automáticamente si están
// seteadas como CLOUDINARY_URL, pero acá se configuran a mano porque el
// resto del proyecto usa variables sueltas y con nombre explícito
// (mismo criterio que SIFEN_CONECTOR_URL/TOKEN).

import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class ErrorImagen extends Error {}

// Sube un buffer (la foto ya recibida en memoria via multer) y devuelve la
// URL publica. carpeta agrupa las fotos en el dashboard de Cloudinary
// (ej. "empremas/servicios") - no tiene efecto en la app en si.
export function subirImagen(buffer, carpeta) {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return Promise.reject(new ErrorImagen('La subida de fotos no está configurada todavía (faltan las credenciales de Cloudinary).'));
    }
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: carpeta, resource_type: 'image' },
            (error, resultado) => {
                if (error) {
                    reject(new ErrorImagen('No se pudo subir la imagen. Probá de nuevo.'));
                    return;
                }
                resolve(resultado.secure_url);
            }
        );
        stream.end(buffer);
    });
}
