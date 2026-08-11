// Cliente de la API de Sifende (https://sifende.com.py) para emitir
// Factura Electronica via SIFEN. Basado en su documentacion publica -
// los nombres exactos de algunos campos pueden necesitar un ajuste una
// vez que probemos contra el sandbox real con una API key de verdad
// (ver plan de la Fase 1: "el detalle exacto de algunos campos no esta
// 100% confirmado hasta probar en vivo").

const URL_BASE = 'https://api.sifende.com.py/api/v1';

class ErrorSifen extends Error {}

async function llamarSifen(metodo, ruta, apiKey, cuerpo) {
    const respuesta = await fetch(`${URL_BASE}${ruta}`, {
        method: metodo,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });

    if (!respuesta.ok) {
        const textoCrudo = await respuesta.text().catch(() => '');
        // Log completo del lado del servidor (no solo lo que se muestra en
        // el ticket) - la API de Sifende sigue el formato "Problem Details"
        // (RFC 7807: title/detail/errors), no siempre mensaje/error, asi
        // que ademas de intentar esos campos se guarda el body crudo para
        // no perder informacion mientras se ajustan los nombres exactos.
        console.error(`Sifende ${respuesta.status} en ${ruta}:`, textoCrudo);
        let detalle = {};
        try {
            detalle = JSON.parse(textoCrudo);
        } catch {
            // no era JSON, se usa textoCrudo tal cual mas abajo
        }
        const mensaje =
            detalle.detail ||
            detalle.title ||
            detalle.mensaje ||
            detalle.error ||
            (Array.isArray(detalle.errors) ? detalle.errors.map((e) => e.detail || e.message || JSON.stringify(e)).join('; ') : null) ||
            textoCrudo ||
            `Sifende respondió ${respuesta.status}`;
        throw new ErrorSifen(mensaje);
    }
    return respuesta;
}

// El RUC paraguayo se escribe "numero-DV" (ej. "80012345-6"). Un
// documento sin guion se asume cedula, no RUC.
function esRuc(documento) {
    return typeof documento === 'string' && documento.includes('-');
}

function partirRuc(ruc) {
    const [numero, dv] = ruc.split('-');
    return { numero, dv };
}

// Arma el bloque "receptor" del payload a partir del cliente de la
// venta. El "Consumidor Final" generico (es_generico=true) se manda
// como innominado, tal como lo documenta SIFEN para ventas sin
// comprador puntual.
function receptorDeCliente(cliente) {
    if (cliente.es_generico) {
        return {
            tipoContribuyente: 'NO_CONTRIBUYENTE',
            tipoOperacion: 'B2C',
            tipoDocumento: 'INNOMINADO',
            numeroDocumento: '0',
            nombreRazonSocial: 'SIN NOMBRE',
        };
    }

    if (esRuc(cliente.documento)) {
        const { numero, dv } = partirRuc(cliente.documento);
        return {
            tipoContribuyente: 'CONTRIBUYENTE',
            tipoOperacion: 'B2B',
            tipoDocumento: 'RUC',
            numeroDocumento: numero,
            digitoVerificador: dv,
            nombreRazonSocial: cliente.nombre,
        };
    }

    return {
        tipoContribuyente: 'NO_CONTRIBUYENTE',
        tipoOperacion: 'B2C',
        tipoDocumento: 'CEDULA_PARAGUAYA',
        numeroDocumento: cliente.documento || '0',
        nombreRazonSocial: cliente.nombre,
    };
}

// Mapeo de nuestras formas de pago a lo que espera SIFEN. Solo EFECTIVO
// esta confirmado contra la documentacion real de Sifende - el resto son
// la mejor suposicion hasta probarlos en vivo (mismo espiritu que el
// resto de este archivo).
const FORMA_PAGO_SIFEN = {
    efectivo: 'EFECTIVO',
    transferencia: 'TRANSFERENCIA',
    tarjeta_credito: 'TARJETA_CREDITO',
    tarjeta_debito: 'TARJETA_DEBITO',
};

// SIFEN exige "condicionPago" cuando condicionOperacion es CONTADO (error
// real visto en pruebas: "condicionPago es requerido cuando
// condicionOperacion es CONTADO"). Para pagos mixtos (ej. mitad efectivo
// mitad tarjeta) se manda la forma de pago del monto mas grande - no hay
// confirmacion todavia de si Sifende acepta multiples formas de pago en
// un mismo condicionPago.
function condicionPagoDeVenta(venta) {
    const pagos = venta.pagos || [];
    if (pagos.length === 0) return null;
    const principal = [...pagos].sort((a, b) => Number(b.monto) - Number(a.monto))[0];
    const montoTotal = pagos.reduce((acumulado, p) => acumulado + Number(p.monto), 0);
    return {
        tipo: 'CONTADO',
        tipoPago: FORMA_PAGO_SIFEN[principal.formaPago] || 'EFECTIVO',
        monedaPago: 'PYG',
        montoPago: montoTotal,
    };
}

// tasa_iva de nuestro catalogo (0, 5 o 10) a como lo pide SIFEN: 0 es
// "exento", 5/10 son "gravado" con esa tasa. No manejamos "exonerado"
// (no hay ningun producto marcado asi en el catalogo todavia).
function ivaDeItem(item) {
    if (Number(item.tasa_iva) === 0) {
        return { afectacionTributaria: 'EXENTO', tasaIVA: 0 };
    }
    return { afectacionTributaria: 'GRAVADO', tasaIVA: Number(item.tasa_iva) };
}

// Emite una Factura Electronica. `items` debe traer, por cada linea,
// producto_id/nombre/tasa_iva ademas de cantidad/precioUnitario (ver
// ventasController.crearVenta, que ya tiene todo eso disponible antes
// de llamar aca).
export async function emitirFacturaElectronica({ apiKey, establecimiento, puntoExpedicion, venta, items, cliente }) {
    const payload = {
        tipoDocumento: 'FACTURA_ELECTRONICA',
        fechaEmision: new Date().toISOString().slice(0, 19),
        tipoEmision: 'NORMAL',
        numeroEstablecimiento: establecimiento,
        puntoExpedicion: Number(puntoExpedicion) || 1,
        tipoTransaccion: 'VENTA_MERCADERIA',
        monedaOperacion: 'PYG',
        receptor: receptorDeCliente(cliente),
        condicionOperacion: venta.tipoPago === 'credito' ? 'CREDITO' : 'CONTADO',
        ...(venta.tipoPago !== 'credito' ? { condicionPago: condicionPagoDeVenta(venta) } : {}),
        // producto_id (asi lo trae reintentarSifen, con SELECT directo) o
        // productoId (asi lo trae crearVenta, con itemsCalculados en JS) -
        // sin este fallback, un envio nuevo (no un reintento) mandaba
        // "codigo" vacio y Sifende lo rechazaba.
        items: items.map((item) => ({
            codigo: item.producto_id || item.productoId,
            descripcion: item.nombre,
            cantidad: Number(item.cantidad),
            unidadMedida: 'UNI',
            precioUnitario: Number(item.precioUnitario),
            ...ivaDeItem(item),
        })),
    };

    const respuesta = await llamarSifen('POST', '/documento-electronico', apiKey, payload);
    const datos = await respuesta.json();
    return {
        cdc: datos.cdc,
        estado: datos.estado,
        numeroFormateado: datos.numeroFormateado,
    };
}

export async function consultarEstado({ apiKey, cdc }) {
    const respuesta = await llamarSifen('GET', `/documento-electronico/status/${cdc}`, apiKey);
    const datos = await respuesta.json();
    return {
        estado: datos.estado,
        mensajeError: datos.mensajeRechazo || null,
    };
}

// Devuelve el PDF (KuDE) como Buffer, solo disponible una vez APROBADO.
export async function descargarKude({ apiKey, cdc }) {
    const respuesta = await llamarSifen('GET', `/documento-electronico/${cdc}/kude`, apiKey);
    const arrayBuffer = await respuesta.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export { ErrorSifen };
