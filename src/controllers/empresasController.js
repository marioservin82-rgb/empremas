import pool, { transaccionDeEmpresa } from '../config/db.js';
import { efectivoDisponibleActual } from './turnosController.js';

export async function obtenerEmpresaActual(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await pool.query(
        `SELECT razon_social, ruc, timbrado, direccion, telefono, plazo_credito_dias,
                permitir_venta_sin_stock, limite_sucursales, vence_en, ticket_escala,
                email, direccion_atencion, sifen_cert_vencimiento, sifen_cert_nota,
                datos_fiscales_modificado_en, impresora_agente_nombre
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
        `SELECT sifen_api_key, sifen_establecimiento, telefono, direccion FROM empresas WHERE id = $1`,
        [empresaId]
    );
    const fila = resultado.rows[0];
    const apiKey = fila?.sifen_api_key;

    res.json({
        configurado: !!apiKey,
        ultimosDigitos: apiKey ? apiKey.slice(-4) : null,
        establecimiento: fila?.sifen_establecimiento ?? 1,
        telefono: fila?.telefono ?? null,
        direccion: fila?.direccion ?? null,
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
        razonSocial, ruc, direccion, direccionAtencion, telefono, email,
        sifenCertVencimiento, sifenCertNota, impresoraAgenteNombre,
    } = req.body;

    if (ticketEscala !== undefined && !(Number(ticketEscala) >= 50 && Number(ticketEscala) <= 300)) {
        return res.status(400).json({ error: 'La escala del ticket debe estar entre 50% y 300%' });
    }
    if (razonSocial !== undefined && !razonSocial?.trim()) {
        return res.status(400).json({ error: 'La razón social no puede quedar vacía' });
    }
    if (ruc !== undefined && !ruc?.trim()) {
        return res.status(400).json({ error: 'El RUC no puede quedar vacío' });
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
            datos_fiscales_modificado_en = CASE
                WHEN ($4 IS NOT NULL AND $4 <> razon_social) OR ($5 IS NOT NULL AND $5 <> ruc)
                THEN now() ELSE datos_fiscales_modificado_en END,
            datos_fiscales_modificado_por = CASE
                WHEN ($4 IS NOT NULL AND $4 <> razon_social) OR ($5 IS NOT NULL AND $5 <> ruc)
                THEN $12 ELSE datos_fiscales_modificado_por END
         WHERE id = $1
         RETURNING razon_social, ruc, timbrado, direccion, direccion_atencion, telefono, email,
                   permitir_venta_sin_stock, ticket_escala, sifen_cert_vencimiento, sifen_cert_nota,
                   datos_fiscales_modificado_en, impresora_agente_nombre`,
        [empresaId, permitirVentaSinStock, ticketEscala, razonSocial, ruc, direccion,
            direccionAtencion, telefono, email, sifenCertVencimiento, sifenCertNota, usuarioId,
            impresoraAgenteNombre]
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
