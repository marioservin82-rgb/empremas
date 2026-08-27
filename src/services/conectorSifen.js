// Cliente del conector propio EMPREMAS-SIFEN (repo aparte). EMPREMAS lo consume
// para dar de alta el "tenant" fiscal de cada cliente, correr la homologación
// contra el ambiente de test de la DNIT y pasar a producción.
//
// El conector guarda los datos sensibles (certificado .pfx, CSC, contraseñas);
// EMPREMAS nunca los persiste - los recibe del formulario admin y los reenvía.

import 'dotenv/config';

const URL_BASE = process.env.SIFEN_CONECTOR_URL || 'http://127.0.0.1:3100';
const TOKEN = process.env.SIFEN_CONECTOR_TOKEN || '';

export class ErrorConector extends Error {}

async function llamar(metodo, ruta, cuerpo) {
    let respuesta;
    try {
        respuesta = await fetch(`${URL_BASE}${ruta}`, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json',
                ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
            },
            body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
    } catch (error) {
        throw new ErrorConector(
            `No se pudo contactar al conector de facturación electrónica (${URL_BASE}). ¿Está corriendo?`
        );
    }

    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
        const detalle = Array.isArray(datos.errores)
            ? datos.errores.join('; ')
            : datos.error || datos.mensaje || `El conector respondió ${respuesta.status}`;
        throw new ErrorConector(detalle);
    }
    return datos;
}

// Alta del tenant fiscal en el conector (ambiente de test).
// `datos` sale casi tal cual del formulario admin (ver facturacionElectronicaController).
export function crearTenant(datos) {
    return llamar('POST', '/v1/tenants', datos);
}

// Actualiza timbrado / CSC / ambiente / certificado / números iniciales.
export function actualizarTenant(tenantId, cambios) {
    return llamar('PATCH', `/v1/tenants/${tenantId}`, cambios);
}

export function obtenerTenant(tenantId) {
    return llamar('GET', `/v1/tenants/${tenantId}`);
}

// Lanza la homologación (checklist DNIT) para ese tenant. Devuelve enseguida
// con estado "corriendo"; el resultado se consulta con obtenerHomologacion.
export function dispararHomologacion(tenantId, { rapido = false } = {}) {
    return llamar('POST', `/v1/tenants/${tenantId}/homologacion`, { rapido });
}

export function obtenerHomologacion(tenantId) {
    return llamar('GET', `/v1/tenants/${tenantId}/homologacion`);
}
