import pool from '../config/db.js';
import {
    actualizarTenant,
    crearTenant,
    dispararHomologacion,
    obtenerHomologacion,
    obtenerTenant,
    inutilizarNumeracion,
} from '../services/conectorSifen.js';

// CSC público de prueba de la DNIT (no es secreto - está en la guía oficial).
const CSC_TEST = { idCsc: '0001', csc: 'ABCD0000000000000000000000000000' };

async function empresaBase(id) {
    const { rows } = await pool.query(
        `SELECT id, razon_social, ruc, telefono, email, direccion,
                sifen_conector_tenant_id, sifen_estado, sifen_ambiente,
                sifen_remision, sifen_nc_nd, sifen_autofactura
         FROM empresas WHERE id = $1`,
        [id]
    );
    return rows[0] || null;
}

// Copia a la fila de empresas los datos fiscales del emisor que devuelve el
// conector (actividad económica, timbrado, inicio de vigencia). Son datos que
// van impresos en el KuDE/ticket; el conector es la fuente de verdad, acá se
// guarda una copia de solo lectura para no pegarle en cada venta. Best-effort:
// si algo falla no rompe el flujo que la llamó.
async function sincronizarDatosFiscales(empresaId, tenant) {
    if (!tenant) return;
    try {
        const actividades = Array.isArray(tenant.actividadesEconomicas)
            ? tenant.actividadesEconomicas
                  .filter((a) => a && a.codigo && a.descripcion)
                  .map((a) => ({ codigo: String(a.codigo), descripcion: String(a.descripcion) }))
            : null;
        await pool.query(
            `UPDATE empresas
                SET sifen_actividades     = $2,
                    sifen_timbrado_numero = $3,
                    sifen_timbrado_inicio = $4,
                    sifen_timbrado_fin    = $5,
                    sifen_cert_desde      = $6,
                    sifen_cert_vence      = $7,
                    -- El conector es la fuente de verdad del nombre de fantasía
                    -- para una empresa con facturación electrónica.
                    nombre_fantasia       = COALESCE($8, nombre_fantasia)
              WHERE id = $1`,
            [
                empresaId,
                actividades && actividades.length ? JSON.stringify(actividades) : null,
                tenant.timbradoNumero || null,
                tenant.timbradoFechaInicio || null,
                tenant.timbradoFechaFin || null,
                tenant.certDesde || null,
                tenant.certVencimiento || null,
                tenant.nombreFantasia || null,
            ]
        );
    } catch (error) {
        console.error('[sifen] no se pudieron sincronizar los datos fiscales del emisor:', error.message);
    }
}

function vistaEmpresa(e) {
    return {
        id: e.id,
        razonSocial: e.razon_social,
        ruc: e.ruc,
        conectorTenantId: e.sifen_conector_tenant_id,
        estado: e.sifen_estado,
        ambiente: e.sifen_ambiente,
        // Documentos electrónicos habilitados (plus del plan). La factura va
        // implícita con estado 'produccion'.
        documentos: {
            factura: e.sifen_estado === 'produccion',
            remision: !!e.sifen_remision,
            nc_nd: !!e.sifen_nc_nd,
            autofactura: !!e.sifen_autofactura,
        },
    };
}

// GET /api/admin/empresas/:id/facturacion-electronica
// Estado local + vista en vivo del conector + última homologación.
export async function obtenerEstado(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    let conector = null;
    let homologacion = null;

    if (empresa.sifen_conector_tenant_id) {
        try {
            conector = await obtenerTenant(empresa.sifen_conector_tenant_id);
            homologacion = await obtenerHomologacion(empresa.sifen_conector_tenant_id);
            await sincronizarDatosFiscales(empresa.id, conector);
        } catch (error) {
            // El conector puede estar caído - se devuelve lo local igual.
            return res.json({
                empresa: vistaEmpresa(empresa),
                conector: null,
                homologacion: null,
                avisoConector: error.message,
            });
        }

        // Avanza el estado local a "homologada" si la homologación pasó, o si lo
        // único que falló fueron los chequeos de resultado de lote (envío asíncrono):
        // esos timeouts no afectan la emisión de a un documento, que es lo que usa
        // el punto de venta. Cualquier otra falla sí bloquea.
        const c = homologacion?.corrida;
        const soloFallanLotes =
            c &&
            c.estado === 'fallo' &&
            Array.isArray(c.fallos) &&
            c.fallos.length > 0 &&
            c.fallos.every((f) => /lote/i.test(f));
        if ((c?.estado === 'ok' || soloFallanLotes) && empresa.sifen_estado === 'homologacion') {
            await pool.query(`UPDATE empresas SET sifen_estado = 'homologada' WHERE id = $1`, [empresa.id]);
            empresa.sifen_estado = 'homologada';
        }
    }

    res.json({ empresa: vistaEmpresa(empresa), conector, homologacion });
}

// POST /api/admin/empresas/:id/facturacion-electronica
// Dos modos:
//  - { conectorTenantId: N }  -> vincula un tenant que YA existe en el conector
//    (caso migración: la empresa ya se homologó / opera con el conector).
//  - datos completos           -> crea el tenant en el conector, ambiente test.
export async function darDeAlta(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (empresa.sifen_conector_tenant_id) {
        return res.status(409).json({ error: 'Esta empresa ya tiene facturación electrónica configurada' });
    }

    const b = req.body || {};

    // --- Modo vincular tenant existente ---
    if (b.conectorTenantId) {
        let tenant;
        try {
            tenant = await obtenerTenant(Number(b.conectorTenantId));
        } catch (error) {
            return res.status(422).json({ error: `No se pudo leer el tenant ${b.conectorTenantId} en el conector: ${error.message}` });
        }
        const estado = tenant.ambiente === 'prod' ? 'produccion' : 'homologacion';
        await pool.query(
            `UPDATE empresas SET sifen_conector_tenant_id = $2, sifen_estado = $3, sifen_ambiente = $4 WHERE id = $1`,
            [empresa.id, tenant.id, estado, tenant.ambiente]
        );
        await sincronizarDatosFiscales(empresa.id, tenant);
        const actualizada = await empresaBase(req.params.id);
        return res.status(200).json({ empresa: vistaEmpresa(actualizada), conector: tenant, vinculado: true });
    }

    const payload = {
        ruc: String(b.ruc || '').trim(),
        dvRuc: String(b.dvRuc || '').trim(),
        razonSocial: (b.razonSocial || empresa.razon_social || '').trim(),
        nombreFantasia: b.nombreFantasia || undefined,
        tipoContribuyente: Number(b.tipoContribuyente) || 1,
        actividadesEconomicas: Array.isArray(b.actividadesEconomicas) ? b.actividadesEconomicas : [],
        establecimiento: b.establecimiento || 1,
        puntoExpedicion: b.puntoExpedicion || 1,
        establecimientoDireccion: (b.establecimientoDireccion || '').trim(),
        establecimientoNumeroCasa: b.establecimientoNumeroCasa || undefined,
        establecimientoCiudad: Number(b.establecimientoCiudad),
        establecimientoTelefono: b.establecimientoTelefono || empresa.telefono || undefined,
        establecimientoEmail: b.establecimientoEmail || empresa.email || undefined,
        timbradoNumero: String(b.timbradoNumero || '').trim(),
        timbradoFechaInicio: String(b.timbradoFechaInicio || '').trim(),
        timbradoFechaFin: b.timbradoFechaFin ? String(b.timbradoFechaFin).trim() : undefined,
        idCsc: b.idCsc || CSC_TEST.idCsc,
        csc: b.csc || CSC_TEST.csc,
        certificadoBase64: b.certificadoBase64,
        certificadoPassword: b.certificadoPassword,
        ambiente: 'test',
    };

    // Validación mínima local; el conector hace la validación fina y devuelve
    // una lista de errores clara que se propaga tal cual.
    const faltan = [];
    if (!payload.ruc) faltan.push('RUC');
    if (!payload.dvRuc) faltan.push('dígito verificador');
    if (!payload.actividadesEconomicas.length) faltan.push('al menos una actividad económica');
    if (!payload.establecimientoDireccion) faltan.push('dirección del establecimiento');
    if (!Number.isInteger(payload.establecimientoCiudad)) faltan.push('código de ciudad');
    if (!payload.timbradoNumero) faltan.push('número de timbrado');
    if (!payload.timbradoFechaInicio) faltan.push('fecha de inicio del timbrado');
    if (!payload.certificadoBase64) faltan.push('certificado .pfx');
    if (!payload.certificadoPassword) faltan.push('contraseña del certificado');
    if (faltan.length) {
        return res.status(400).json({ error: `Faltan datos: ${faltan.join(', ')}` });
    }

    let tenant;
    try {
        tenant = await crearTenant(payload);
    } catch (error) {
        return res.status(422).json({ error: error.message });
    }

    await pool.query(
        `UPDATE empresas SET
            sifen_conector_tenant_id = $2,
            sifen_estado = 'homologacion',
            sifen_ambiente = 'test'
         WHERE id = $1`,
        [empresa.id, tenant.id]
    );
    await sincronizarDatosFiscales(empresa.id, tenant);

    const actualizada = await empresaBase(req.params.id);
    res.status(201).json({ empresa: vistaEmpresa(actualizada), conector: tenant });
}

// POST /api/admin/empresas/:id/facturacion-electronica/homologacion
export async function correrHomologacion(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (!empresa.sifen_conector_tenant_id) {
        return res.status(409).json({ error: 'Primero hay que dar de alta la facturación electrónica' });
    }
    if (empresa.sifen_estado === 'produccion') {
        return res.status(409).json({ error: 'Esta empresa ya está en producción' });
    }

    try {
        const corrida = await dispararHomologacion(empresa.sifen_conector_tenant_id, {
            rapido: req.body?.rapido === true,
        });
        res.status(202).json(corrida);
    } catch (error) {
        res.status(422).json({ error: error.message });
    }
}

// PATCH /api/admin/empresas/:id/facturacion-electronica
// Pase a producción: timbrado y CSC reales + números iniciales de migración.
export async function pasarAProduccion(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (!empresa.sifen_conector_tenant_id) {
        return res.status(409).json({ error: 'Primero hay que dar de alta la facturación electrónica' });
    }
    if (empresa.sifen_estado !== 'homologada' && empresa.sifen_estado !== 'produccion') {
        return res.status(409).json({
            error: 'La empresa tiene que estar homologada (pruebas aprobadas) antes de pasar a producción',
        });
    }

    const b = req.body || {};
    const cambios = { ambiente: 'prod' };
    if (b.timbradoNumero) cambios.timbradoNumero = String(b.timbradoNumero).trim();
    if (b.timbradoFechaInicio) cambios.timbradoFechaInicio = String(b.timbradoFechaInicio).trim();
    if (b.timbradoFechaFin !== undefined) {
        cambios.timbradoFechaFin = b.timbradoFechaFin ? String(b.timbradoFechaFin).trim() : null;
    }
    if (b.idCsc) cambios.idCsc = String(b.idCsc).trim();
    if (b.csc) cambios.csc = String(b.csc).trim();
    if (b.certificadoBase64) {
        cambios.certificadoBase64 = b.certificadoBase64;
        cambios.certificadoPassword = b.certificadoPassword;
    }
    if (b.numerosIniciales && typeof b.numerosIniciales === 'object') {
        cambios.numerosIniciales = b.numerosIniciales;
    }

    if (!cambios.timbradoNumero || !cambios.timbradoFechaInicio || !cambios.csc) {
        return res.status(400).json({
            error: 'Para producción hacen falta el timbrado real (número y fecha) y el CSC real',
        });
    }

    let tenant;
    try {
        tenant = await actualizarTenant(empresa.sifen_conector_tenant_id, cambios);
    } catch (error) {
        return res.status(422).json({ error: error.message });
    }

    await pool.query(
        `UPDATE empresas SET sifen_estado = 'produccion', sifen_ambiente = 'prod' WHERE id = $1`,
        [empresa.id]
    );
    await sincronizarDatosFiscales(empresa.id, tenant);

    const actualizada = await empresaBase(req.params.id);
    res.json({ empresa: vistaEmpresa(actualizada), conector: tenant });
}

// PATCH /api/admin/empresas/:id/facturacion-electronica/emisor
// Edita datos del emisor que van impresos en los documentos electrónicos y
// que hoy sólo se podían cargar en el alta. Por ahora: nombre de fantasía
// (gEmis/dNomFanEmi). Vacío lo borra.
export async function actualizarEmisor(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (!empresa.sifen_conector_tenant_id) {
        return res.status(409).json({ error: 'Esta empresa no tiene facturación electrónica configurada' });
    }

    const b = req.body || {};
    const cambios = {};
    if (b.nombreFantasia !== undefined) {
        const v = String(b.nombreFantasia || '').trim();
        if (v.length > 60) return res.status(400).json({ error: 'El nombre de fantasía no puede superar 60 caracteres' });
        cambios.nombreFantasia = v || null;
    }
    if (Object.keys(cambios).length === 0) {
        return res.status(400).json({ error: 'No hay nada para actualizar' });
    }

    let tenant;
    try {
        tenant = await actualizarTenant(empresa.sifen_conector_tenant_id, cambios);
    } catch (error) {
        return res.status(422).json({ error: error.message });
    }

    await sincronizarDatosFiscales(empresa.id, tenant);
    const actualizada = await empresaBase(req.params.id);
    res.json({ empresa: vistaEmpresa(actualizada), conector: tenant });
}

// iTiDE por nombre de documento (para el ajuste de numeración).
const TIPOS_ITIDE = { factura: 1, autofactura: 4, nota_credito: 5, nota_debito: 6, remision: 7 };

// POST /api/admin/empresas/:id/facturacion-electronica/numeracion
// Ajusta el "último número emitido" de un tipo de documento en el conector.
// `obtenerProximoNumero` devuelve ultimoNumero + 1, así que para que la próxima
// factura sea la 323 hay que dejar ultimoNumero = 322.
export async function ajustarNumeracion(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (!empresa.sifen_conector_tenant_id) {
        return res.status(409).json({ error: 'Esta empresa no tiene facturación electrónica configurada' });
    }

    const b = req.body || {};
    const tipo = TIPOS_ITIDE[b.tipo] || Number(b.tipo);
    const ultimoNumero = Number(b.ultimoNumero);
    if (![1, 4, 5, 6, 7].includes(tipo)) {
        return res.status(400).json({ error: 'tipo inválido (factura, autofactura, nota_credito, nota_debito, remision)' });
    }
    if (!Number.isInteger(ultimoNumero) || ultimoNumero < 0) {
        return res.status(400).json({ error: 'ultimoNumero debe ser un entero >= 0' });
    }

    try {
        const tenant = await actualizarTenant(empresa.sifen_conector_tenant_id, {
            numerosIniciales: { [tipo]: ultimoNumero },
        });
        res.json({ ok: true, conector: tenant });
    } catch (error) {
        res.status(422).json({ error: error.message });
    }
}

// POST /api/admin/empresas/:id/facturacion-electronica/inutilizar
// Inutiliza en SIFEN un rango de numeración que quedó sin usar (p. ej. una
// factura rechazada cuya venta se anuló). { tipo, desde, hasta, motivo }.
export async function inutilizarRango(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (!empresa.sifen_conector_tenant_id) {
        return res.status(409).json({ error: 'Esta empresa no tiene facturación electrónica configurada' });
    }
    if (empresa.sifen_estado !== 'produccion') {
        return res.status(409).json({ error: 'La inutilización solo aplica en producción' });
    }

    const b = req.body || {};
    const tipo = TIPOS_ITIDE[b.tipo] || Number(b.tipo);
    const desde = Number(b.desde);
    const hasta = b.hasta != null && b.hasta !== '' ? Number(b.hasta) : desde;
    const motivo = String(b.motivo || '').trim();

    if (![1, 4, 5, 6, 7].includes(tipo)) {
        return res.status(400).json({ error: 'tipo inválido' });
    }
    if (!Number.isInteger(desde) || desde < 1 || !Number.isInteger(hasta) || hasta < desde) {
        return res.status(400).json({ error: 'Rango inválido (desde >= 1, hasta >= desde)' });
    }
    if (hasta - desde >= 1000) {
        return res.status(400).json({ error: 'El rango no puede superar los 1000 números' });
    }
    if (motivo.length < 5) {
        return res.status(400).json({ error: 'El motivo tiene que tener al menos 5 caracteres' });
    }

    try {
        const r = await inutilizarNumeracion(empresa.sifen_conector_tenant_id, {
            tipoDocumento: tipo,
            desde,
            hasta,
            motivo,
        });
        res.json(r);
    } catch (error) {
        res.status(422).json({ error: error.message });
    }
}

// PUT /api/admin/empresas/:id/documentos-habilitados
// Habilita/deshabilita los documentos electrónicos extra (plus del plan).
export async function actualizarDocumentosHabilitados(req, res) {
    const empresa = await empresaBase(req.params.id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const b = req.body || {};
    const remision = b.remision === true;
    const ncNd = b.nc_nd === true;
    const autofactura = b.autofactura === true;

    await pool.query(
        `UPDATE empresas SET sifen_remision = $2, sifen_nc_nd = $3, sifen_autofactura = $4 WHERE id = $1`,
        [empresa.id, remision, ncNd, autofactura]
    );

    const actualizada = await empresaBase(req.params.id);
    res.json({ empresa: vistaEmpresa(actualizada) });
}
