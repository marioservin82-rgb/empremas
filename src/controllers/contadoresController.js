import pool from '../config/db.js';
import { rangoDelMes } from '../utils/rangoDelMes.js';

// Normaliza un nombre a la base del codigo (sin tildes/espacios, en
// mayusculas) - "Juan Pérez" -> "JPEREZ" (inicial del primer nombre +
// ultima palabra, que suele ser el apellido).
const MARCAS_DIACRITICAS = new RegExp('[̀-ͯ]', 'g');

function baseDeCodigo(nombre) {
    const partes = nombre
        .normalize('NFD')
        .replace(MARCAS_DIACRITICAS, '')
        .trim()
        .split(/\s+/);
    const inicial = partes[0]?.[0] || '';
    const apellido = partes[partes.length - 1] || '';
    return (inicial + apellido).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CONTADOR';
}

async function generarCodigoReferido(nombre) {
    const base = baseDeCodigo(nombre);
    const existentes = await pool.query(
        `SELECT codigo_referido FROM contadores_aliados WHERE codigo_referido LIKE $1`,
        [`CONT-${base}-%`]
    );
    const usados = new Set(existentes.rows.map((f) => f.codigo_referido));
    let sufijo = 1;
    let codigo;
    do {
        codigo = `CONT-${base}-${String(sufijo).padStart(2, '0')}`;
        sufijo++;
    } while (usados.has(codigo));
    return codigo;
}

// Genera perezosamente (si hace falta) y devuelve las filas de comision de
// un contador para un periodo dado - mismo mecanismo que gastos_recurrentes
// -> gastos en obtenerBalanceMensual: una fila por (contador, empresa,
// periodo), creada la primera vez que se consulta, con el monto de plan
// vigente en ese momento (foto congelada, no se retoca despues aunque el
// plan de la empresa cambie).
async function generarYObtenerComisiones(contadorId, periodo) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const pendientes = await cliente.query(
            `SELECT e.id AS empresa_id, e.monto_plan_mensual
             FROM empresas e
             WHERE e.contador_id = $1 AND e.estado = 'activa'
               AND NOT EXISTS (
                   SELECT 1 FROM comisiones_contador cc
                   WHERE cc.contador_id = $1 AND cc.empresa_id = e.id AND cc.periodo = $2
               )`,
            [contadorId, periodo]
        );
        for (const fila of pendientes.rows) {
            const montoPlan = Number(fila.monto_plan_mensual || 0);
            await cliente.query(
                `INSERT INTO comisiones_contador (contador_id, empresa_id, periodo, monto_plan, comision)
                 VALUES ($1, $2, $3, $4, $5)`,
                [contadorId, fila.empresa_id, periodo, montoPlan, montoPlan * 0.2]
            );
        }
        await cliente.query('COMMIT');
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }

    const resultado = await pool.query(
        `SELECT cc.id, cc.empresa_id, e.razon_social, cc.monto_plan, cc.comision, cc.pagado, cc.pagado_en
         FROM comisiones_contador cc
         JOIN empresas e ON e.id = cc.empresa_id
         WHERE cc.contador_id = $1 AND cc.periodo = $2
         ORDER BY e.razon_social ASC`,
        [contadorId, periodo]
    );
    return resultado.rows;
}

async function umbralAlertaContador() {
    const resultado = await pool.query(`SELECT umbral_alerta_contador FROM configuracion_plataforma LIMIT 1`);
    return resultado.rows[0]?.umbral_alerta_contador ?? 15;
}

export async function listarContadores(req, res) {
    const umbral = await umbralAlertaContador();
    const periodoActual = rangoDelMes().desde;

    const resultado = await pool.query(
        `SELECT c.id, c.nombre, c.telefono, c.email, c.ruc, c.codigo_referido, c.activo, c.creado_en,
                (SELECT COUNT(*) FROM empresas e WHERE e.contador_id = c.id AND e.estado = 'activa') AS clientes_activos
         FROM contadores_aliados c
         ORDER BY c.nombre ASC`
    );

    const contadores = await Promise.all(
        resultado.rows.map(async (c) => {
            const comisiones = await generarYObtenerComisiones(c.id, periodoActual);
            const comisionMesActual = comisiones.reduce((acumulado, f) => acumulado + Number(f.comision), 0);
            const clientesActivos = Number(c.clientes_activos);
            return {
                ...c,
                clientesActivos,
                comisionMesActual,
                superaUmbral: clientesActivos >= umbral,
                tieneRuc: !!c.ruc,
            };
        })
    );

    res.json({ contadores, umbralAlertaContador: umbral });
}

export async function crearContador(req, res) {
    const { nombre, telefono, email, ruc } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (!telefono || !telefono.trim()) {
        return res.status(400).json({ error: 'El teléfono es obligatorio' });
    }

    const codigoReferido = await generarCodigoReferido(nombre.trim());

    const resultado = await pool.query(
        `INSERT INTO contadores_aliados (nombre, telefono, email, ruc, codigo_referido)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [nombre.trim(), telefono.trim(), email || null, ruc || null, codigoReferido]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function obtenerContador(req, res) {
    const { id } = req.params;

    const contador = await pool.query(`SELECT * FROM contadores_aliados WHERE id = $1`, [id]);
    if (!contador.rows[0]) {
        return res.status(404).json({ error: 'Contador no encontrado' });
    }

    // Todas las empresas alguna vez referidas (activas e inactivas, para
    // contexto historico) - no solo las activas, a diferencia del conteo
    // que dispara la alerta de facturacion.
    const empresas = await pool.query(
        `SELECT id, razon_social, estado, monto_plan_mensual FROM empresas WHERE contador_id = $1 ORDER BY razon_social ASC`,
        [id]
    );

    // Historico de periodos ya generados, agrupado - un contador puede
    // tener muchas empresas por periodo, se suma para el total y se toma
    // "pagado" de cualquiera de las filas (todas deberian coincidir, se
    // actualizan siempre juntas).
    const historico = await pool.query(
        `SELECT periodo, SUM(comision) AS total, bool_and(pagado) AS pagado
         FROM comisiones_contador
         WHERE contador_id = $1
         GROUP BY periodo
         ORDER BY periodo DESC`,
        [id]
    );

    res.json({
        contador: contador.rows[0],
        empresas: empresas.rows,
        historico: historico.rows,
    });
}

export async function actualizarContador(req, res) {
    const { id } = req.params;
    const { nombre, telefono, email, ruc, activo, codigoReferido } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE contadores_aliados SET
                nombre = COALESCE($2, nombre),
                telefono = COALESCE($3, telefono),
                email = $4,
                ruc = $5,
                activo = COALESCE($6, activo),
                codigo_referido = COALESCE($7, codigo_referido)
             WHERE id = $1
             RETURNING *`,
            [
                id,
                nombre,
                telefono,
                email === undefined ? undefined : email || null,
                ruc === undefined ? undefined : ruc || null,
                activo,
                codigoReferido ? codigoReferido.trim().toUpperCase() : undefined,
            ]
        );
        if (!resultado.rows[0]) {
            return res.status(404).json({ error: 'Contador no encontrado' });
        }
        res.json(resultado.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ese código de referido ya está en uso' });
        }
        throw error;
    }
}

export async function comisionesDelPeriodo(req, res) {
    const { id } = req.params;
    const { periodo } = req.query;
    const { desde } = rangoDelMes(periodo);

    const contador = await pool.query(`SELECT id FROM contadores_aliados WHERE id = $1`, [id]);
    if (!contador.rows[0]) {
        return res.status(404).json({ error: 'Contador no encontrado' });
    }

    const items = await generarYObtenerComisiones(id, desde);
    const total = items.reduce((acumulado, f) => acumulado + Number(f.comision), 0);
    const pagado = items.length > 0 && items.every((f) => f.pagado);

    res.json({ periodo: desde, items, total, pagado });
}

export async function marcarPagado(req, res) {
    const { id } = req.params;
    const { periodo, pagado } = req.body;

    if (!periodo) {
        return res.status(400).json({ error: 'Falta el período' });
    }
    const { desde } = rangoDelMes(periodo);

    // Genera primero, por si Mario marca pagado sin haber abierto el
    // detalle de ese periodo todavia.
    await generarYObtenerComisiones(id, desde);

    await pool.query(
        `UPDATE comisiones_contador SET pagado = $3, pagado_en = CASE WHEN $3 THEN now() ELSE NULL END
         WHERE contador_id = $1 AND periodo = $2`,
        [id, desde, !!pagado]
    );

    res.json({ ok: true });
}
