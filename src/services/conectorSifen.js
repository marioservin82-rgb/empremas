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

async function descargar(ruta) {
    let respuesta;
    try {
        respuesta = await fetch(`${URL_BASE}${ruta}`, {
            headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
        });
    } catch (error) {
        throw new ErrorConector(`No se pudo contactar al conector (${URL_BASE}).`);
    }
    if (!respuesta.ok) {
        throw new ErrorConector(`El conector respondió ${respuesta.status} al pedir el archivo`);
    }
    return Buffer.from(await respuesta.arrayBuffer());
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

// ---------- Emisión de documentos ----------

// Emite una Factura Electrónica. `venta` ya viene con la forma que espera el
// conector (ver mapearVentaAConector). `numeroReintento` (7 díg. o
// "001-001-0000322") reemite una factura rechazada con SU número original.
// Respuesta: { cdc, estado, protocoloAutorizacion, errores, totales }.
export function emitirFactura(tenantId, venta, numeroReintento) {
    const cuerpo = { tenantId, venta };
    if (numeroReintento) cuerpo.numeroReintento = String(numeroReintento);
    return llamar('POST', '/v1/documentos/factura', cuerpo);
}

export function consultarDocumento(cdc) {
    return llamar('GET', `/v1/documentos/${cdc}`);
}

// Emite una Nota de Remisión Electrónica. `remision` con la forma de
// mapearRemisionAConector. Respuesta: { cdc, estado, protocoloAutorizacion, errores }.
export function emitirRemision(tenantId, remision) {
    return llamar('POST', '/v1/documentos/nota-remision', { tenantId, remision });
}

// Arma la entrada de POST /v1/documentos/nota-remision desde una remisión de
// EMPREMAS. `receptor` ya resuelto (resolverReceptor). `items`: [{ codigo?,
// productoId?, nombre, cantidad }]. `remision`: fila de la tabla remisiones.
export function mapearRemisionAConector({ remision, items, receptor }) {
    const t = remision.transporte || {};
    const fecha = (remision.fecha_traslado || '').toString().slice(0, 10) || undefined;

    const salida = {
        receptor,
        items: items.map((it, i) => ({
            codigo: String(it.codigo || it.productoId || it.producto_id || i + 1),
            descripcion: it.nombre || it.producto_nombre || 'Producto',
            cantidad: Number(it.cantidad),
            unidadMedida: 77,
        })),
        motivo: Number(remision.motivo) || 1,
        kmEstimados: Number(remision.km_estimados) || 1,
        fechaInicioTraslado: fecha,
        fechaFinTraslado: fecha,
        entrega: {
            direccion: remision.direccion_entrega || 'Sin dirección',
            ...(remision.ciudad_entrega ? { ciudad: Number(remision.ciudad_entrega) } : {}),
        },
        tipoTransporte: Number(t.tipoTransporte) || 1,
        modalidad: Number(t.modalidad) || 1,
        responsableFlete: Number(t.responsableFlete) || 5,
        vehiculo: {
            tipo: t.vehiculo?.tipo || 'VEHICULO',
            marca: t.vehiculo?.marca || 'S/M',
            chapa: t.vehiculo?.chapa || 'SINCHAPA',
        },
        transportista: t.transportista?.contribuyente
            ? {
                  contribuyente: true,
                  nombre: t.transportista.nombre,
                  ruc: t.transportista.ruc,
                  direccion: t.transportista.direccion || 'Sin dirección',
                  chofer: t.transportista.chofer,
              }
            : {
                  contribuyente: false,
                  nombre: t.transportista?.nombre || 'Transportista',
                  documentoTipo: Number(t.transportista?.documentoTipo) || 1,
                  documentoNumero: String(t.transportista?.documentoNumero || '0'),
                  direccion: t.transportista?.direccion || 'Sin dirección',
                  chofer: t.transportista?.chofer || {
                      nombre: t.transportista?.nombre || 'Chofer',
                      documentoNumero: String(t.transportista?.documentoNumero || '0'),
                      direccion: t.transportista?.direccion || 'Sin dirección',
                  },
              },
        observacion: remision.observacion || undefined,
    };

    if (remision.factura_cdc) {
        salida.cdcFacturaAsociada = remision.factura_cdc;
    } else if (remision.fecha_futura_factura) {
        salida.fechaFuturaFactura = remision.fecha_futura_factura.toString().slice(0, 10);
    }

    return salida;
}

// Inutiliza un rango de numeración no usado (evento SIFEN). `desde`/`hasta`
// son enteros (el número de 7 díg. sin ceros a la izquierda). Máx. 1000.
export function inutilizarNumeracion(tenantId, { tipoDocumento, desde, hasta, motivo, serie }) {
    return llamar('POST', '/v1/inutilizaciones', {
        tenantId,
        tipoDocumento,
        desde,
        hasta,
        motivo,
        ...(serie ? { serie } : {}),
    });
}

// Emite una Nota de Crédito (tipo='credito') o Débito ('debito') electrónica.
// `nota`: { motivo, cdcFacturaAsociada, items:[{codigo,descripcion,cantidad,
//   precioUnitario,ivaTasa}], observacion? }. `receptor` ya resuelto.
export function emitirNota(tenantId, tipo, nota, receptor) {
    const ruta = tipo === 'debito' ? '/v1/documentos/nota-debito' : '/v1/documentos/nota-credito';
    return llamar('POST', ruta, { tenantId, nota: { ...nota, receptor } });
}

// Consulta un RUC en el padrón de SIFEN (para saber si un receptor es
// contribuyente antes de emitir). `numero` va sin dígito verificador.
// Respuesta: { ruc, encontrado, razonSocial, digitoVerificador, estado }.
export function consultarRuc(tenantId, numero) {
    const limpio = String(numero).split('-')[0].replace(/\D/g, '');
    return llamar('GET', `/v1/ruc/${encodeURIComponent(limpio)}?tenantId=${tenantId}`);
}

export function descargarKude(cdc) {
    return descargar(`/v1/documentos/${cdc}/kude`);
}

// iTiOpe (D201) forzado por la clasificación SIFEN del cliente. 'auto' deja
// que lo decida el conector (1 contribuyente / 2 no contribuyente).
const ITIOPE_POR_CLASIFICACION = { b2b: 1, b2c: 2, b2g: 3, b2f: 4 };

// Clasifica al receptor consultando el padrón de SIFEN cuando el documento
// tiene pinta de RUC ("numero-DV"). Sin esto, una cédula escrita con dígito
// ("4659459-0") se manda como RUC y SIFEN RECHAZA el DE porque ese RUC no
// existe. `tenantId` es obligatorio para poder consultar; si falla la
// consulta se cae a la heurística (mejor emitir con la duda que no emitir).
export async function resolverReceptor({ cliente, tenantId }) {
    const nombre = (cliente?.nombre || '').trim();
    const doc = (cliente?.documento || '').trim();
    const tipoOperacion = ITIOPE_POR_CLASIFICACION[cliente?.clasificacion_sifen] || undefined;
    const conITiOpe = (r) => (tipoOperacion ? { ...r, tipoOperacion } : r);

    if (cliente?.es_generico || !doc) {
        return conITiOpe({ contribuyente: false, documentoTipo: 5, documentoNumero: '0', razonSocial: 'SIN NOMBRE' });
    }
    if (!doc.includes('-')) {
        return conITiOpe({ contribuyente: false, documentoTipo: 1, documentoNumero: doc, razonSocial: nombre || 'SIN NOMBRE' });
    }

    // Tiene "-": puede ser un RUC real o una cédula escrita con verificador.
    if (tenantId) {
        try {
            const r = await consultarRuc(tenantId, doc);
            if (r?.encontrado) {
                return conITiOpe({
                    contribuyente: true,
                    ruc: doc,
                    tipoContribuyente: 1,
                    razonSocial: r.razonSocial || nombre || 'SIN NOMBRE',
                });
            }
            // Consultado y NO existe -> es una cédula con dígito. Se manda sin el DV.
            return conITiOpe({
                contribuyente: false,
                documentoTipo: 1,
                documentoNumero: doc.split('-')[0],
                razonSocial: nombre || 'SIN NOMBRE',
            });
        } catch {
            // El conector/SIFEN no respondió: se sigue con la heurística vieja.
        }
    }
    return conITiOpe(mapearReceptor(cliente));
}

// Traduce una venta de EMPREMAS a la forma que espera POST /v1/documentos/factura.
// `cliente`: { nombre, documento, es_generico }.  `items`: [{ nombre, cantidad, precioUnitario, tasa_iva }].
// `venta`: { tipoPago, pagos, plazoCreditoDias, vencimiento }.
// `receptor` (opcional): ya resuelto por resolverReceptor(); si no viene se usa la heurística.
export function mapearVentaAConector({ venta, items, cliente, receptor }) {
    const receptorFinal = receptor || mapearReceptor(cliente);
    const itemsConector = items.map((it, i) => ({
        codigo: String(it.codigo || it.productoId || i + 1),
        descripcion: it.nombre || 'Producto',
        cantidad: Number(it.cantidad),
        unidadMedida: 77, // Unidad
        precioUnitario: Math.round(Number(it.precioUnitario)),
        ivaTasa: [0, 5, 10].includes(Number(it.tasa_iva)) ? Number(it.tasa_iva) : 10,
    }));

    const salida = {
        condicionVenta: venta.tipoPago === 'credito' ? 'credito' : 'contado',
        receptor: receptorFinal,
        items: itemsConector,
    };

    if (venta.tipoPago === 'credito') {
        // Fiado / cuenta corriente = crédito "a plazo" (un solo vencimiento).
        const dias = venta.plazoCreditoDias || 30;
        salida.credito = { tipo: 1, plazo: `${dias} días` };
    }

    // Si la venta factura una Nota de Remisión ya emitida, se asocia por CDC.
    if (venta.cdcRemisionAsociada) {
        salida.cdcRemisionAsociada = venta.cdcRemisionAsociada;
    }

    return salida;
}

function mapearReceptor(cliente) {
    const nombre = (cliente?.nombre || '').trim();
    const doc = (cliente?.documento || '').trim();

    // Consumidor Final / sin documento -> innominado.
    if (cliente?.es_generico || !doc) {
        return { contribuyente: false, documentoTipo: 5, documentoNumero: '0', razonSocial: 'SIN NOMBRE' };
    }

    // RUC ("numero-DV") -> contribuyente.
    if (doc.includes('-')) {
        return { contribuyente: true, ruc: doc, tipoContribuyente: 1, razonSocial: nombre || 'SIN NOMBRE' };
    }

    // Cédula paraguaya.
    return { contribuyente: false, documentoTipo: 1, documentoNumero: doc, razonSocial: nombre || 'SIN NOMBRE' };
}
