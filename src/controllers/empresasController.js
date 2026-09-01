import pool, { transaccionDeEmpresa } from '../config/db.js';
import { efectivoDisponibleActual } from './turnosController.js';

export async function obtenerEmpresaActual(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await pool.query(
        `SELECT razon_social, nombre_fantasia, ruc, timbrado, direccion, telefono, plazo_credito_dias,
                sifen_estado, sifen_actividades, sifen_timbrado_numero, sifen_timbrado_inicio,
                sifen_timbrado_fin, sifen_cert_desde, sifen_cert_vence, sifen_cert_vencimiento,
                permitir_venta_sin_stock, produccion_habilitada, sugerencias_venta_habilitadas,
                comisiones_habilitadas, politica_clientes_vendedor_inactivo,
                lomiteria_habilitada,
                limite_sucursales, vence_en, ticket_escala,
                email, direccion_atencion, sifen_cert_vencimiento, sifen_cert_nota,
                datos_fiscales_modificado_en, impresora_agente_nombre,
                recordatorio_dias_aviso_previo, recordatorio_dias_mora_prolongada,
                recordatorio_incluir_ruc, recordatorio_incluir_telefono,
                recordatorio_mensaje_previo, recordatorio_mensaje_hoy,
                recordatorio_mensaje_mora_leve, recordatorio_mensaje_mora_prolongada
         FROM empresas WHERE id = $1`,
        [empresaId]
    );

    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json(resultado.rows[0]);
}

// Tamaño maximo del logo (como data URI, base64 incluido): ~2MB de
// archivo real. Suficiente para un logo, evita que alguien suba una
// foto gigante y hinche la fila de empresas.
const LOGO_MAX_LARGO = 2_800_000;

// El logo se guarda en su propio endpoint, separado del resto de la
// config - asi las pantallas que solo necesitan saber "esta SIFEN
// configurado" (ej. el probe de Vender) no bajan un blob grande de
// imagen en cada carga de pagina.
export async function obtenerLogo(req, res) {
    const { empresaId } = req.usuario;
    const resultado = await pool.query(`SELECT logo FROM empresas WHERE id = $1`, [empresaId]);
    res.json({ logo: resultado.rows[0]?.logo ?? null });
}

// Preset de transporte para las Notas de Remisión (vehículo, chofer,
// transportista, modalidad). Se copia a cada remisión y se puede editar ahí.
export async function obtenerPresetRemision(req, res) {
    const { empresaId } = req.usuario;
    const r = await pool.query(`SELECT preset_remision FROM empresas WHERE id = $1`, [empresaId]);
    res.json({ preset: r.rows[0]?.preset_remision ?? null });
}

export async function actualizarPresetRemision(req, res) {
    const { empresaId } = req.usuario;
    const p = req.body?.preset;

    if (!p || typeof p !== 'object' || !p.vehiculo || !p.transportista) {
        return res.status(400).json({ error: 'Faltan los datos del vehículo o del transportista' });
    }
    const v = p.vehiculo;
    if (!String(v.tipo || '').trim() || !String(v.marca || '').trim() || !String(v.chapa || '').trim()) {
        return res.status(400).json({ error: 'El vehículo necesita tipo, marca y chapa' });
    }
    const t = p.transportista;
    const ch = t.chofer || {};
    if (!String(t.nombre || '').trim() || !String(ch.nombre || '').trim() || !String(ch.documentoNumero || '').trim()) {
        return res.status(400).json({ error: 'El transportista y el chofer necesitan nombre y el chofer un documento' });
    }

    const preset = {
        tipoTransporte: Number(p.tipoTransporte) || 1,
        modalidad: Number(p.modalidad) || 1,
        responsableFlete: Number(p.responsableFlete) || 5,
        vehiculo: { tipo: String(v.tipo).trim(), marca: String(v.marca).trim(), chapa: String(v.chapa).trim() },
        transportista: t.contribuyente
            ? {
                  contribuyente: true,
                  nombre: String(t.nombre).trim(),
                  ruc: String(t.ruc || '').trim(),
                  direccion: String(t.direccion || '').trim(),
                  chofer: {
                      nombre: String(ch.nombre).trim(),
                      documentoNumero: String(ch.documentoNumero).trim().replace(/\D/g, ''),
                      direccion: String(ch.direccion || t.direccion || '').trim(),
                  },
              }
            : {
                  contribuyente: false,
                  nombre: String(t.nombre).trim(),
                  documentoTipo: Number(t.documentoTipo) || 1,
                  documentoNumero: String(t.documentoNumero || '').trim().replace(/\D/g, ''),
                  direccion: String(t.direccion || '').trim(),
                  chofer: {
                      nombre: String(ch.nombre).trim(),
                      documentoNumero: String(ch.documentoNumero).trim().replace(/\D/g, ''),
                      direccion: String(ch.direccion || t.direccion || '').trim(),
                  },
              },
    };

    await pool.query(`UPDATE empresas SET preset_remision = $2 WHERE id = $1`, [empresaId, JSON.stringify(preset)]);
    res.json({ preset });
}

export async function actualizarLogo(req, res) {
    const { empresaId } = req.usuario;
    const { logo } = req.body;

    if (logo !== null && (typeof logo !== 'string' || !logo.startsWith('data:image/'))) {
        return res.status(400).json({ error: 'El logo debe ser una imagen válida' });
    }
    if (logo && logo.length > LOGO_MAX_LARGO) {
        return res.status(400).json({ error: 'El logo es demasiado pesado (máximo ~2MB)' });
    }

    await pool.query(`UPDATE empresas SET logo = $2 WHERE id = $1`, [empresaId, logo]);
    res.json({ logo: logo ?? null });
}

// Config de facturacion electronica (SIFEN via Sifende). La API key
// nunca se devuelve completa - solo si esta configurada y sus ultimos
// 4 caracteres, para que el dueno pueda confirmar cual cargo sin que
// quede expuesta en cada GET.
export async function obtenerConfigSifen(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await pool.query(
        `SELECT sifen_api_key, sifen_establecimiento, telefono, direccion, sifen_estado,
                sifen_remision, sifen_nc_nd, sifen_autofactura
         FROM empresas WHERE id = $1`,
        [empresaId]
    );
    const fila = resultado.rows[0];
    const apiKey = fila?.sifen_api_key;
    // "Configurado" habilita Factura Legal en Vender: la empresa usa el conector
    // propio y ya está en producción, o tiene api key de Sifende (camino legacy).
    const porConector = fila?.sifen_estado === 'produccion';

    res.json({
        configurado: porConector || !!apiKey,
        via: porConector ? 'conector' : apiKey ? 'sifende' : null,
        ultimosDigitos: apiKey ? apiKey.slice(-4) : null,
        establecimiento: fila?.sifen_establecimiento ?? 1,
        telefono: fila?.telefono ?? null,
        direccion: fila?.direccion ?? null,
        // Documentos electrónicos habilitados (plus del plan).
        documentos: {
            factura: porConector,
            remision: !!fila?.sifen_remision,
            nc_nd: !!fila?.sifen_nc_nd,
            autofactura: !!fila?.sifen_autofactura,
        },
    });
}

export async function actualizarConfigSifen(req, res) {
    const { empresaId } = req.usuario;
    const { apiKey, establecimiento, telefono, direccion } = req.body;

    if (apiKey !== undefined && (!apiKey || apiKey.length < 10)) {
        return res.status(400).json({ error: 'La API key no parece válida' });
    }
    if (establecimiento !== undefined && !(Number(establecimiento) > 0)) {
        return res.status(400).json({ error: 'El número de establecimiento debe ser mayor a cero' });
    }

    const resultado = await pool.query(
        `UPDATE empresas SET
            sifen_api_key = COALESCE($2, sifen_api_key),
            sifen_establecimiento = COALESCE($3, sifen_establecimiento),
            telefono = COALESCE($4, telefono),
            direccion = COALESCE($5, direccion)
         WHERE id = $1
         RETURNING sifen_api_key, sifen_establecimiento, telefono, direccion`,
        [empresaId, apiKey, establecimiento, telefono, direccion]
    );
    const fila = resultado.rows[0];
    res.json({
        configurado: !!fila.sifen_api_key,
        ultimosDigitos: fila.sifen_api_key ? fila.sifen_api_key.slice(-4) : null,
        establecimiento: fila.sifen_establecimiento,
        telefono: fila.telefono,
        direccion: fila.direccion,
    });
}

export async function actualizarConfiguracion(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const {
        permitirVentaSinStock, ticketEscala,
        razonSocial, nombreFantasia, ruc, direccion, direccionAtencion, telefono, email,
        sifenCertVencimiento, sifenCertNota, impresoraAgenteNombre,
        recordatorioDiasAvisoPrevio, recordatorioDiasMoraProlongada,
        recordatorioIncluirRuc, recordatorioIncluirTelefono,
        recordatorioMensajePrevio, recordatorioMensajeHoy,
        recordatorioMensajeMoraLeve, recordatorioMensajeMoraProlongada,
        sugerenciasVentaHabilitadas,
        comisionesHabilitadas, politicaClientesVendedorInactivo,
    } = req.body;
    // Producción y Lomitería/Restaurante ya NO se activan desde la app del
    // cliente — los habilita EMPREMAS por empresa (panel admin). Se ignora
    // cualquier valor que llegue en el body.
    const produccionHabilitada = null;
    const lomiteriaHabilitada = null;

    if (politicaClientesVendedorInactivo !== undefined && !['mantener', 'desasignar'].includes(politicaClientesVendedorInactivo)) {
        return res.status(400).json({ error: 'Política inválida' });
    }

    if (ticketEscala !== undefined && !(Number(ticketEscala) >= 50 && Number(ticketEscala) <= 300)) {
        return res.status(400).json({ error: 'La escala del ticket debe estar entre 50% y 300%' });
    }
    if (razonSocial !== undefined && !razonSocial?.trim()) {
        return res.status(400).json({ error: 'La razón social no puede quedar vacía' });
    }
    if (nombreFantasia !== undefined && String(nombreFantasia).trim().length > 60) {
        return res.status(400).json({ error: 'El nombre de fantasía no puede superar 60 caracteres' });
    }
    if (ruc !== undefined && !ruc?.trim()) {
        return res.status(400).json({ error: 'El RUC no puede quedar vacío' });
    }
    if (recordatorioDiasAvisoPrevio !== undefined && !(Number(recordatorioDiasAvisoPrevio) >= 0)) {
        return res.status(400).json({ error: 'Los días de aviso previo deben ser 0 o más' });
    }
    if (recordatorioDiasMoraProlongada !== undefined && !(Number(recordatorioDiasMoraProlongada) >= 0)) {
        return res.status(400).json({ error: 'Los días de mora prolongada deben ser 0 o más' });
    }

    // Si razon_social o ruc cambian de verdad (no solo se re-envia el mismo
    // valor), queda registrado quien y cuando - son los dos datos fiscales
    // que se imprimen en cada documento SIFEN, por eso la trazabilidad.
    const resultado = await pool.query(
        `UPDATE empresas SET
            permitir_venta_sin_stock = COALESCE($2, permitir_venta_sin_stock),
            ticket_escala = COALESCE($3, ticket_escala),
            razon_social = COALESCE($4, razon_social),
            ruc = COALESCE($5, ruc),
            direccion = COALESCE($6, direccion),
            direccion_atencion = COALESCE($7, direccion_atencion),
            telefono = COALESCE($8, telefono),
            email = COALESCE($9, email),
            sifen_cert_vencimiento = COALESCE($10, sifen_cert_vencimiento),
            sifen_cert_nota = COALESCE($11, sifen_cert_nota),
            impresora_agente_nombre = COALESCE($13, impresora_agente_nombre),
            recordatorio_dias_aviso_previo = COALESCE($14, recordatorio_dias_aviso_previo),
            recordatorio_dias_mora_prolongada = COALESCE($15, recordatorio_dias_mora_prolongada),
            recordatorio_incluir_ruc = COALESCE($16, recordatorio_incluir_ruc),
            recordatorio_incluir_telefono = COALESCE($17, recordatorio_incluir_telefono),
            recordatorio_mensaje_previo = COALESCE($18, recordatorio_mensaje_previo),
            recordatorio_mensaje_hoy = COALESCE($19, recordatorio_mensaje_hoy),
            recordatorio_mensaje_mora_leve = COALESCE($20, recordatorio_mensaje_mora_leve),
            recordatorio_mensaje_mora_prolongada = COALESCE($21, recordatorio_mensaje_mora_prolongada),
            produccion_habilitada = COALESCE($22, produccion_habilitada),
            sugerencias_venta_habilitadas = COALESCE($23, sugerencias_venta_habilitadas),
            -- "" limpia el nombre de fantasía; null (campo no enviado) lo deja igual.
            -- Cast explicito ::text: sin el, Postgres no siempre puede inferir el
            -- tipo de $27 cuando la PRIMERA referencia que ve es "$27 IS NULL"
            -- (sin contexto de tipo) - eso hacia fallar con 500 CUALQUIER PATCH a
            -- este endpoint que no mandara nombreFantasia (la gran mayoria: ticket
            -- de impresora, recordatorios, etc.), aunque nunca se tocara este campo.
            nombre_fantasia = CASE WHEN $27::text IS NULL THEN nombre_fantasia
                                   WHEN $27::text = '' THEN NULL ELSE $27::text END,
            -- Activar Lomiteria activa tambien Comisiones (cada mesero es
            -- ademas un vendedor - sin esto no tendria donde configurar su
            -- comision). $26 pisa a $24 solo cuando se prende Lomiteria.
            -- Lomitería (la habilita el admin) fuerza Vendedores por comisión:
            -- el cliente no puede apagar comisiones si tiene el módulo activo.
            comisiones_habilitadas = CASE WHEN lomiteria_habilitada THEN true
                                          ELSE COALESCE($24, comisiones_habilitadas) END,
            politica_clientes_vendedor_inactivo = COALESCE($25, politica_clientes_vendedor_inactivo),
            lomiteria_habilitada = COALESCE($26, lomiteria_habilitada),
            datos_fiscales_modificado_en = CASE
                WHEN ($4 IS NOT NULL AND $4 <> razon_social) OR ($5 IS NOT NULL AND $5 <> ruc)
                THEN now() ELSE datos_fiscales_modificado_en END,
            datos_fiscales_modificado_por = CASE
                WHEN ($4 IS NOT NULL AND $4 <> razon_social) OR ($5 IS NOT NULL AND $5 <> ruc)
                THEN $12 ELSE datos_fiscales_modificado_por END
         WHERE id = $1
         RETURNING razon_social, nombre_fantasia, ruc, timbrado, direccion, direccion_atencion, telefono, email,
                   permitir_venta_sin_stock, produccion_habilitada, sugerencias_venta_habilitadas,
                   comisiones_habilitadas, politica_clientes_vendedor_inactivo, lomiteria_habilitada,
                   ticket_escala, sifen_cert_vencimiento, sifen_cert_nota,
                   datos_fiscales_modificado_en, impresora_agente_nombre,
                   recordatorio_dias_aviso_previo, recordatorio_dias_mora_prolongada,
                   recordatorio_incluir_ruc, recordatorio_incluir_telefono,
                   recordatorio_mensaje_previo, recordatorio_mensaje_hoy,
                   recordatorio_mensaje_mora_leve, recordatorio_mensaje_mora_prolongada`,
        [empresaId, permitirVentaSinStock, ticketEscala, razonSocial, ruc, direccion,
            direccionAtencion, telefono, email, sifenCertVencimiento, sifenCertNota, usuarioId,
            impresoraAgenteNombre, recordatorioDiasAvisoPrevio, recordatorioDiasMoraProlongada,
            recordatorioIncluirRuc, recordatorioIncluirTelefono, recordatorioMensajePrevio,
            recordatorioMensajeHoy, recordatorioMensajeMoraLeve, recordatorioMensajeMoraProlongada,
            produccionHabilitada, sugerenciasVentaHabilitadas,
            comisionesHabilitadas, politicaClientesVendedorInactivo, lomiteriaHabilitada,
            nombreFantasia === undefined ? null : String(nombreFantasia).trim()]
    );

    res.json(resultado.rows[0]);
}

// Semaforo de salud financiera: compara lo que te deben contra lo que
// tenés en caja ahora mismo. Umbral (primera version, se puede ajustar):
// - verde: lo que te deben cabe una vez en tu efectivo (podés cobrar y
//   seguir operando sin apuro)
// - amarillo: lo que te deben es hasta el doble de tu efectivo
// - rojo: mas del doble - fiar mas te deja sin capital de trabajo
export async function saludFinanciera(req, res) {
    const { empresaId } = req.usuario;

    const { totalPorCobrar, totalPorPagar, efectivoDisponible } = await transaccionDeEmpresa(
        empresaId,
        async (cliente) => {
            const cobrar = await cliente.query(`SELECT COALESCE(SUM(saldo), 0) AS total FROM clientes WHERE activo = true`);
            const pagar = await cliente.query(`SELECT COALESCE(SUM(saldo), 0) AS total FROM proveedores WHERE activo = true`);
            const efectivo = await efectivoDisponibleActual(cliente, empresaId);

            return {
                totalPorCobrar: Number(cobrar.rows[0].total),
                totalPorPagar: Number(pagar.rows[0].total),
                efectivoDisponible: efectivo,
            };
        }
    );

    let semaforo;
    let mensaje;
    let sugerenciaCobrar = 0;

    if (totalPorCobrar === 0) {
        semaforo = 'verde';
        mensaje = 'No tenés fiado pendiente. Podés seguir dando crédito con tranquilidad.';
    } else if (efectivoDisponible <= 0) {
        semaforo = 'rojo';
        sugerenciaCobrar = totalPorCobrar;
        mensaje = 'No tenés efectivo disponible. No te recomendamos dar más crédito hasta cobrar.';
    } else {
        const ratio = totalPorCobrar / efectivoDisponible;
        if (ratio <= 1) {
            semaforo = 'verde';
            mensaje = 'Podés seguir dando crédito con tranquilidad.';
        } else if (ratio <= 2) {
            semaforo = 'amarillo';
            mensaje = 'Cuidado, tu fiado es alto en relación a tu caja. Priorizá cobrar antes de fiar más.';
        } else {
            semaforo = 'rojo';
            sugerenciaCobrar = Math.max(0, totalPorCobrar - 2 * efectivoDisponible);
            mensaje = `Estás al límite. No te recomendamos dar más crédito hasta cobrar al menos Gs ${Math.round(sugerenciaCobrar).toLocaleString('es-PY')}.`;
        }
    }

    res.json({ totalPorCobrar, totalPorPagar, efectivoDisponible, semaforo, mensaje, sugerenciaCobrar });
}

// Detalle de cuentas por cobrar/pagar, para tramites bancarios - mismo
// agregado que saludFinanciera de arriba, pero fila por fila en vez de
// sumado, y pensado para imprimirse en A4 (ver reporte-imprimible en el
// frontend). Es siempre "a hoy": saldo es un total corriente, no un
// historial con fecha, asi que no tiene un filtro de periodo como los
// reportes de ventas/compras.
export async function reporteCuentasPorCobrarYPagar(req, res) {
    const { empresaId } = req.usuario;

    const { clientes, proveedores } = await transaccionDeEmpresa(empresaId, async (cliente) => {
        const cobrar = await cliente.query(
            `SELECT id, nombre, documento, saldo FROM clientes WHERE activo = true AND saldo > 0 ORDER BY saldo DESC`
        );
        const pagar = await cliente.query(
            `SELECT id, nombre, documento, saldo FROM proveedores WHERE activo = true AND saldo > 0 ORDER BY saldo DESC`
        );
        return { clientes: cobrar.rows, proveedores: pagar.rows };
    });

    const totalPorCobrar = clientes.reduce((acumulado, c) => acumulado + Number(c.saldo), 0);
    const totalPorPagar = proveedores.reduce((acumulado, p) => acumulado + Number(p.saldo), 0);

    res.json({ clientes, totalPorCobrar, proveedores, totalPorPagar, generadoEn: new Date() });
}
