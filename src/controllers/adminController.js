import bcrypt from 'bcrypt';
import pool, { consultaDeEmpresa } from '../config/db.js';

// Este controller usa pool directo (no consultaDeEmpresa) para empresas,
// admins_plataforma y pagos_plataforma - ninguna tiene RLS, y el admin de
// plataforma necesita ver TODAS las empresas, no una sola. sucursales SI
// tiene RLS (aislada por app.empresa_actual, una empresa a la vez), asi
// que para su conteo no hay forma de traerlo en el mismo SELECT cruzando
// tenants - se pide aparte, una consultaDeEmpresa por empresa (N+1, pero
// la cantidad de empresas de la plataforma es chica).
async function contarSucursalesActivas(empresaId) {
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT COUNT(*) AS cantidad FROM sucursales WHERE activa = true`,
        []
    );
    return Number(resultado.rows[0].cantidad);
}

async function contarProductosActivos(empresaId) {
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT COUNT(*) AS cantidad FROM productos WHERE activo = true`,
        []
    );
    return Number(resultado.rows[0].cantidad);
}

async function fechaUltimaVenta(empresaId) {
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT MAX(creado_en) AS fecha FROM ventas WHERE anulada = false`,
        []
    );
    return resultado.rows[0].fecha;
}

// Embudo simple para priorizar a quien contactar: sin productos cargados
// (recien se registro, no hizo nada mas) -> con productos pero sin vender
// todavia -> ya vendio al menos una vez.
function calcularEstadoNegocio(productosActivos, ultimaVenta) {
    if (productosActivos === 0) return 'registro_incompleto';
    if (!ultimaVenta) return 'sin_ventas';
    return 'activo';
}

export async function cambiarPassword(req, res) {
    const { adminId } = req.admin;
    const { passwordActual, passwordNueva } = req.body;

    if (!passwordNueva || passwordNueva.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const resultado = await pool.query(`SELECT password_hash FROM admins_plataforma WHERE id = $1`, [adminId]);
    const admin = resultado.rows[0];
    if (!admin || !(await bcrypt.compare(passwordActual || '', admin.password_hash))) {
        return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const passwordHash = await bcrypt.hash(passwordNueva, 10);
    await pool.query(`UPDATE admins_plataforma SET password_hash = $2 WHERE id = $1`, [adminId, passwordHash]);
    res.json({ ok: true });
}

export async function yo(req, res) {
    const { adminId } = req.admin;
    const resultado = await pool.query(`SELECT nombre, email FROM admins_plataforma WHERE id = $1`, [adminId]);
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Admin no encontrado' });
    }
    res.json(resultado.rows[0]);
}

export async function listarEmpresas(req, res) {
    const resultado = await pool.query(
        `SELECT e.id, e.razon_social, e.ruc, e.plan, e.estado, e.limite_usuarios, e.limite_sucursales, e.vence_en,
                e.monto_plan_mensual, e.telefono, e.creado_en,
                (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.activo = true) AS usuarios_activos
         FROM empresas e
         ORDER BY e.razon_social ASC`
    );
    const empresas = await Promise.all(
        resultado.rows.map(async (empresa) => {
            const [sucursalesActivas, productosActivos, ultimaVenta] = await Promise.all([
                contarSucursalesActivas(empresa.id),
                contarProductosActivos(empresa.id),
                fechaUltimaVenta(empresa.id),
            ]);
            return {
                ...empresa,
                sucursales_activas: sucursalesActivas,
                productos_activos: productosActivos,
                ultima_venta: ultimaVenta,
                estado_negocio: calcularEstadoNegocio(productosActivos, ultimaVenta),
            };
        })
    );
    res.json(empresas);
}

export async function obtenerEmpresa(req, res) {
    const { id } = req.params;

    const empresa = await pool.query(
        `SELECT e.id, e.razon_social, e.ruc, e.plan, e.estado, e.limite_usuarios, e.limite_sucursales, e.vence_en,
                e.monto_plan_mensual, e.contador_id, c.nombre AS contador_nombre,
                e.produccion_habilitada, e.lomiteria_habilitada, e.comisiones_habilitadas, e.citas_habilitadas,
                (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.activo = true) AS usuarios_activos
         FROM empresas e
         LEFT JOIN contadores_aliados c ON c.id = e.contador_id
         WHERE e.id = $1`,
        [id]
    );
    if (!empresa.rows[0]) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    empresa.rows[0].sucursales_activas = await contarSucursalesActivas(id);

    const pagos = await pool.query(
        `SELECT p.id, p.monto, p.fecha_pago, p.periodo_desde, p.periodo_hasta, p.notas, a.nombre AS admin_nombre
         FROM pagos_plataforma p
         JOIN admins_plataforma a ON a.id = p.admin_id
         WHERE p.empresa_id = $1
         ORDER BY p.fecha_pago DESC`,
        [id]
    );

    res.json({ ...empresa.rows[0], pagos: pagos.rows });
}

const ESTADOS_VALIDOS = ['prueba', 'activa', 'mora', 'suspendida'];

export async function actualizarEmpresa(req, res) {
    const { id } = req.params;
    const {
        plan, estado, limiteUsuarios, limiteSucursales, venceEn, montoPlanMensual, contadorId,
        produccionHabilitada, lomiteriaHabilitada, citasHabilitada,
    } = req.body;

    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    if (limiteUsuarios !== undefined && !(Number(limiteUsuarios) >= 1)) {
        return res.status(400).json({ error: 'El límite de usuarios debe ser al menos 1' });
    }
    if (limiteSucursales !== undefined && !(Number(limiteSucursales) >= 1)) {
        return res.status(400).json({ error: 'El límite de sucursales debe ser al menos 1' });
    }
    if (montoPlanMensual !== undefined && montoPlanMensual !== null && !(Number(montoPlanMensual) >= 0)) {
        return res.status(400).json({ error: 'El monto de plan mensual debe ser 0 o mayor' });
    }
    // contadorId puede venir null a proposito (desvincular) - se valida
    // que exista solo cuando viene un id de verdad, no en el caso null.
    if (contadorId) {
        const contador = await pool.query(`SELECT id FROM contadores_aliados WHERE id = $1 AND activo = true`, [contadorId]);
        if (!contador.rows[0]) {
            return res.status(400).json({ error: 'El contador aliado elegido no existe o no está activo' });
        }
    }

    const resultado = await pool.query(
        `UPDATE empresas SET
            plan = COALESCE($2, plan),
            estado = COALESCE($3, estado),
            limite_usuarios = COALESCE($4, limite_usuarios),
            limite_sucursales = COALESCE($5, limite_sucursales),
            vence_en = COALESCE($6, vence_en),
            monto_plan_mensual = COALESCE($7, monto_plan_mensual),
            contador_id = CASE WHEN $8 THEN $9::uuid ELSE contador_id END,
            produccion_habilitada = COALESCE($10, produccion_habilitada),
            lomiteria_habilitada = COALESCE($11, lomiteria_habilitada),
            -- El módulo de Lomitería necesita Vendedores por comisión (cada
            -- mesero es un vendedor): al prenderlo se prende también.
            comisiones_habilitadas = CASE WHEN COALESCE($11, lomiteria_habilitada) THEN true
                                          ELSE comisiones_habilitadas END,
            citas_habilitadas = COALESCE($12, citas_habilitadas)
         WHERE id = $1
         RETURNING id, razon_social, plan, estado, limite_usuarios, limite_sucursales, vence_en,
                   monto_plan_mensual, contador_id, produccion_habilitada, lomiteria_habilitada,
                   comisiones_habilitadas, citas_habilitadas`,
        [
            id, plan, estado, limiteUsuarios, limiteSucursales, venceEn, montoPlanMensual,
            contadorId !== undefined, contadorId,
            produccionHabilitada === undefined ? null : produccionHabilitada,
            lomiteriaHabilitada === undefined ? null : lomiteriaHabilitada,
            citasHabilitada === undefined ? null : citasHabilitada,
        ]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json(resultado.rows[0]);
}

// DELETE /api/admin/empresas/:id
// Borra una empresa y TODOS sus datos (cascade). Sólo para limpiar registros
// de prueba / abandonados: se niega si la empresa está activa, si ya vendió,
// si tiene pagos registrados o si tiene facturación electrónica configurada.
export async function eliminarEmpresa(req, res) {
    const { id } = req.params;

    const emp = await pool.query(
        `SELECT razon_social, estado, sifen_conector_tenant_id FROM empresas WHERE id = $1`,
        [id]
    );
    if (!emp.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (emp.rows[0].estado === 'activa') {
        return res.status(409).json({ error: 'No se puede eliminar una empresa activa. Suspendela primero.' });
    }
    if (emp.rows[0].sifen_conector_tenant_id) {
        return res.status(409).json({ error: 'Esta empresa tiene facturación electrónica configurada — no se puede eliminar desde acá.' });
    }
    const ventas = await pool.query(`SELECT 1 FROM ventas WHERE empresa_id = $1 LIMIT 1`, [id]);
    if (ventas.rows[0]) {
        return res.status(409).json({ error: 'Esta empresa ya registró ventas — se conserva por el historial.' });
    }
    const pagos = await pool.query(`SELECT 1 FROM pagos_plataforma WHERE empresa_id = $1 LIMIT 1`, [id]);
    if (pagos.rows[0]) {
        return res.status(409).json({ error: 'Esta empresa tiene pagos de plataforma registrados — no se puede eliminar.' });
    }

    // Cliente dedicado: BEGIN/COMMIT sobre el pool no funciona (cada query
    // puede ir por otra conexión).
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        // comisiones_contador no tiene ON DELETE CASCADE hacia empresas.
        await cliente.query(`DELETE FROM comisiones_contador WHERE empresa_id = $1`, [id]);
        await cliente.query(`DELETE FROM empresas WHERE id = $1`, [id]);
        await cliente.query('COMMIT');
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
    res.json({ ok: true, razon_social: emp.rows[0].razon_social });
}

// Sin proveedor de mensajeria conectado todavia (WhatsApp/email), asi
// que "olvide mi contraseña" no puede mandar un codigo solo - el dueño
// contacta a soporte (boton de WhatsApp ya armado en /recuperar-contrasena)
// y un admin de la plataforma verifica quien es y le genera una
// contraseña temporal desde aca, para pasarsela el mismo por WhatsApp.
// Password legible (sin 0/O/1/l/I, que se confunden al dictarla o leerla).
const ALFABETO_PASSWORD_TEMPORAL = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generarPasswordTemporal(largo = 10) {
    let resultado = '';
    for (let i = 0; i < largo; i++) {
        resultado += ALFABETO_PASSWORD_TEMPORAL[Math.floor(Math.random() * ALFABETO_PASSWORD_TEMPORAL.length)];
    }
    return resultado;
}

export async function resetearPasswordDueno(req, res) {
    const { id } = req.params;

    const dueno = await pool.query(
        `SELECT id, nombre, email, telefono FROM usuarios
         WHERE empresa_id = $1 AND rol = 'dueno'
         ORDER BY creado_en ASC LIMIT 1`,
        [id]
    );
    if (!dueno.rows[0]) {
        return res.status(404).json({ error: 'No se encontró el dueño de esta empresa' });
    }

    const passwordNueva = generarPasswordTemporal();
    const passwordHash = await bcrypt.hash(passwordNueva, 10);
    await pool.query(`UPDATE usuarios SET password_hash = $2 WHERE id = $1`, [dueno.rows[0].id, passwordHash]);

    // La contraseña en texto plano se devuelve UNA sola vez, en esta
    // respuesta - nunca se guarda en ningún lado. El admin la copia y se
    // la pasa al dueño por el mismo canal donde ya lo contactó (WhatsApp).
    res.json({
        duenoNombre: dueno.rows[0].nombre,
        duenoEmail: dueno.rows[0].email,
        duenoTelefono: dueno.rows[0].telefono,
        passwordNueva,
    });
}

// Configuracion global de la plataforma (numero de soporte de EMPREMAS,
// mostrado a todos los tenants). Tabla de una sola fila - GET trae esa
// fila (o null si todavia no existe ninguna) y PATCH la actualiza si
// existe o la crea si es la primera vez que se guarda.
export async function obtenerConfiguracion(req, res) {
    const resultado = await pool.query(
        `SELECT whatsapp_soporte, umbral_alerta_contador, datos_pago FROM configuracion_plataforma LIMIT 1`
    );
    res.json({
        whatsappSoporte: resultado.rows[0]?.whatsapp_soporte ?? null,
        umbralAlertaContador: resultado.rows[0]?.umbral_alerta_contador ?? 15,
        datosPago: resultado.rows[0]?.datos_pago ?? null,
    });
}

export async function actualizarConfiguracion(req, res) {
    const { whatsappSoporte, umbralAlertaContador, datosPago } = req.body;
    if (umbralAlertaContador !== undefined && !(Number(umbralAlertaContador) >= 1)) {
        return res.status(400).json({ error: 'El umbral debe ser 1 o mayor' });
    }

    const existente = await pool.query(`SELECT id FROM configuracion_plataforma LIMIT 1`);
    const resultado = existente.rows[0]
        ? await pool.query(
              `UPDATE configuracion_plataforma SET
                  whatsapp_soporte = $2,
                  umbral_alerta_contador = COALESCE($3, umbral_alerta_contador),
                  datos_pago = $4,
                  actualizado_en = now()
               WHERE id = $1 RETURNING whatsapp_soporte, umbral_alerta_contador, datos_pago`,
              [existente.rows[0].id, whatsappSoporte || null, umbralAlertaContador, datosPago || null]
          )
        : await pool.query(
              `INSERT INTO configuracion_plataforma (whatsapp_soporte, umbral_alerta_contador, datos_pago)
               VALUES ($1, COALESCE($2, 15), $3)
               RETURNING whatsapp_soporte, umbral_alerta_contador, datos_pago`,
              [whatsappSoporte || null, umbralAlertaContador, datosPago || null]
          );

    res.json({
        whatsappSoporte: resultado.rows[0].whatsapp_soporte,
        umbralAlertaContador: resultado.rows[0].umbral_alerta_contador,
        datosPago: resultado.rows[0].datos_pago,
    });
}

const CATEGORIAS_NOVEDAD_VALIDAS = ['nueva_funcion', 'mejora', 'correccion'];

// Novedades que Mario publica para todas las empresas a la vez (sin RLS,
// contenido global de la plataforma - mismo criterio que empresas/pagos).
export async function listarNovedades(req, res) {
    const resultado = await pool.query(
        `SELECT n.id, n.titulo, n.descripcion, n.categoria, n.creado_en, a.nombre AS admin_nombre
         FROM novedades n
         JOIN admins_plataforma a ON a.id = n.admin_id
         ORDER BY n.creado_en DESC`
    );
    res.json(resultado.rows);
}

export async function crearNovedad(req, res) {
    const { adminId } = req.admin;
    const { titulo, descripcion, categoria } = req.body;

    if (!titulo || !titulo.trim() || !descripcion || !descripcion.trim()) {
        return res.status(400).json({ error: 'Título y descripción son obligatorios' });
    }
    if (!CATEGORIAS_NOVEDAD_VALIDAS.includes(categoria)) {
        return res.status(400).json({ error: 'Categoría inválida' });
    }

    const resultado = await pool.query(
        `INSERT INTO novedades (titulo, descripcion, categoria, admin_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, titulo, descripcion, categoria, creado_en`,
        [titulo.trim(), descripcion.trim(), categoria, adminId]
    );
    res.status(201).json(resultado.rows[0]);
}

// Registra un pago y, de paso, actualiza vence_en al periodo cubierto y
// reactiva la cuenta si estaba en mora/suspendida - pagar es la señal
// mas clara de que hay que devolverle el acceso.
export async function registrarPago(req, res) {
    const { adminId } = req.admin;
    const { id } = req.params;
    const { monto, periodoDesde, periodoHasta, notas } = req.body;

    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    if (!periodoDesde || !periodoHasta) {
        return res.status(400).json({ error: 'Indicá el período que cubre el pago' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const empresa = await cliente.query(`SELECT id, estado FROM empresas WHERE id = $1 FOR UPDATE`, [id]);
        if (!empresa.rows[0]) {
            await cliente.query('ROLLBACK');
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        const pago = await cliente.query(
            `INSERT INTO pagos_plataforma (empresa_id, admin_id, monto, periodo_desde, periodo_hasta, notas)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, monto, fecha_pago, periodo_desde, periodo_hasta, notas`,
            [id, adminId, monto, periodoDesde, periodoHasta, notas || null]
        );

        const estadoActual = empresa.rows[0].estado;
        const nuevoEstado = estadoActual === 'mora' || estadoActual === 'suspendida' ? 'activa' : estadoActual;

        await cliente.query(`UPDATE empresas SET vence_en = $2, estado = $3 WHERE id = $1`, [
            id,
            periodoHasta,
            nuevoEstado,
        ]);

        await cliente.query('COMMIT');
        res.status(201).json(pago.rows[0]);
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}
