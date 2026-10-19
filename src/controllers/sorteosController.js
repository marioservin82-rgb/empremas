import pool, { consultaDeEmpresa } from '../config/db.js';

// Modulo "sorteo con cupones" (lo habilita EMPREMAS por empresa, columna
// empresas.sorteos_habilitado). Las tablas tienen RLS: siempre consultaDeEmpresa.

async function moduloHabilitado(empresaId) {
    const r = await pool.query(`SELECT sorteos_habilitado FROM empresas WHERE id = $1`, [empresaId]);
    return !!r.rows[0]?.sorteos_habilitado;
}

function aSorteo(f) {
    return {
        id: f.id,
        nombre: f.nombre,
        montoPorCupon: Number(f.monto_por_cupon),
        vigenteDesde: f.vigente_desde,
        vigenteHasta: f.vigente_hasta,
        fechaSorteo: f.fecha_sorteo,
        premios: f.premios,
        activo: f.activo,
        vigenteHoy: f.vigente_hoy,
        creadoEn: f.creado_en,
    };
}

const SELECT_SORTEO = `SELECT s.*,
        (s.activo
          AND (s.vigente_desde IS NULL OR s.vigente_desde <= (now() AT TIME ZONE 'America/Asuncion')::date)
          AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= (now() AT TIME ZONE 'America/Asuncion')::date)) AS vigente_hoy
     FROM sorteos s`;

// DATE de Postgres llega como Date (medianoche local): se manda como texto
// YYYY-MM-DD para que el front no lo corra un dia por la zona horaria.
function fechaTexto(valor) {
    if (!valor) return null;
    if (typeof valor === 'string') return valor.slice(0, 10);
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function sorteoParaFront(f) {
    const s = aSorteo(f);
    return {
        ...s,
        vigenteDesde: fechaTexto(s.vigenteDesde),
        vigenteHasta: fechaTexto(s.vigenteHasta),
        fechaSorteo: fechaTexto(s.fechaSorteo),
    };
}

// GET /api/sorteos/actual?clienteId=  (cualquier rol: lo usa Vender)
// Devuelve el sorteo activo (si lo hay) y, si se manda clienteId, cuanto
// lleva acumulado ese cliente para avisar cuantos cupones suma la compra.
export async function sorteoActual(req, res) {
    const { empresaId } = req.usuario;
    if (!(await moduloHabilitado(empresaId))) {
        return res.json({ habilitado: false, sorteo: null });
    }
    const r = await consultaDeEmpresa(empresaId, `${SELECT_SORTEO} WHERE s.activo = true`, []);
    const fila = r.rows[0];
    if (!fila) return res.json({ habilitado: true, sorteo: null });

    let pendiente = 0;
    if (req.query.clienteId) {
        const c = await consultaDeEmpresa(
            empresaId,
            `SELECT monto_pendiente FROM sorteo_clientes WHERE sorteo_id = $1 AND cliente_id = $2`,
            [fila.id, req.query.clienteId]
        );
        pendiente = Number(c.rows[0]?.monto_pendiente || 0);
    }
    res.json({ habilitado: true, sorteo: sorteoParaFront(fila), pendiente });
}

// GET /api/sorteos  (dueno/encargado): todas las campañas, la activa primero.
export async function listarSorteos(req, res) {
    const { empresaId } = req.usuario;
    if (!(await moduloHabilitado(empresaId))) {
        return res.status(403).json({ error: 'El sorteo no está habilitado para tu empresa' });
    }
    const r = await consultaDeEmpresa(empresaId, `${SELECT_SORTEO} ORDER BY s.activo DESC, s.creado_en DESC`, []);
    res.json({ sorteos: r.rows.map(sorteoParaFront) });
}

function validarDatos(body, { parcial }) {
    const out = {};
    if (body.nombre !== undefined || !parcial) {
        const nombre = String(body.nombre || '').trim();
        if (!nombre) return { error: 'Poné un nombre para el sorteo' };
        out.nombre = nombre;
    }
    if (body.montoPorCupon !== undefined || !parcial) {
        const monto = Number(body.montoPorCupon);
        if (!Number.isInteger(monto) || monto <= 0) return { error: 'El monto por cupón debe ser un número entero mayor a 0' };
        out.montoPorCupon = monto;
    }
    for (const [campo, etiqueta] of [
        ['vigenteDesde', 'inicio'],
        ['vigenteHasta', 'fin'],
        ['fechaSorteo', 'sorteo'],
    ]) {
        if (body[campo] !== undefined) {
            const v = body[campo] || null;
            if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: `Fecha de ${etiqueta} inválida` };
            out[campo] = v;
        }
    }
    if (out.vigenteDesde && out.vigenteHasta && out.vigenteHasta < out.vigenteDesde) {
        return { error: 'La fecha de fin no puede ser anterior a la de inicio' };
    }
    if (body.premios !== undefined) out.premios = String(body.premios || '').trim() || null;
    return { datos: out };
}

// POST /api/sorteos  (dueno)
export async function crearSorteo(req, res) {
    const { empresaId } = req.usuario;
    if (!(await moduloHabilitado(empresaId))) {
        return res.status(403).json({ error: 'El sorteo no está habilitado para tu empresa' });
    }
    const { datos, error } = validarDatos(req.body, { parcial: false });
    if (error) return res.status(400).json({ error });

    const activo = await consultaDeEmpresa(empresaId, `SELECT 1 FROM sorteos WHERE activo = true`, []);
    if (activo.rows.length > 0) {
        return res.status(400).json({ error: 'Ya hay un sorteo activo: cerralo antes de crear otro' });
    }
    const r = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO sorteos (empresa_id, nombre, monto_por_cupon, vigente_desde, vigente_hasta, fecha_sorteo, premios)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
            empresaId,
            datos.nombre,
            datos.montoPorCupon,
            datos.vigenteDesde || null,
            datos.vigenteHasta || null,
            datos.fechaSorteo || null,
            datos.premios || null,
        ]
    );
    res.status(201).json({ id: r.rows[0].id });
}

// PATCH /api/sorteos/:id  (dueno): editar o cerrar ({ activo: false }).
// El monto por cupon no se cambia una vez emitido el primer cupon: cambiaria
// las reglas a mitad de camino.
export async function actualizarSorteo(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { datos, error } = validarDatos(req.body, { parcial: true });
    if (error) return res.status(400).json({ error });

    const actual = await consultaDeEmpresa(empresaId, `SELECT id, activo FROM sorteos WHERE id = $1`, [id]);
    if (!actual.rows[0]) return res.status(404).json({ error: 'Sorteo no encontrado' });

    if (datos.montoPorCupon !== undefined) {
        const emitidos = await consultaDeEmpresa(empresaId, `SELECT 1 FROM sorteo_cupones WHERE sorteo_id = $1 LIMIT 1`, [id]);
        if (emitidos.rows.length > 0) {
            return res.status(400).json({ error: 'Ya se emitieron cupones: el monto por cupón no se puede cambiar' });
        }
    }
    const { activo } = req.body;
    if (activo === true && !actual.rows[0].activo) {
        const otro = await consultaDeEmpresa(empresaId, `SELECT 1 FROM sorteos WHERE activo = true`, []);
        if (otro.rows.length > 0) return res.status(400).json({ error: 'Ya hay otro sorteo activo' });
    }

    await consultaDeEmpresa(
        empresaId,
        `UPDATE sorteos SET
            nombre = COALESCE($2, nombre),
            monto_por_cupon = COALESCE($3, monto_por_cupon),
            vigente_desde = CASE WHEN $4::boolean THEN $5::date ELSE vigente_desde END,
            vigente_hasta = CASE WHEN $6::boolean THEN $7::date ELSE vigente_hasta END,
            fecha_sorteo = CASE WHEN $8::boolean THEN $9::date ELSE fecha_sorteo END,
            premios = CASE WHEN $10::boolean THEN $11 ELSE premios END,
            activo = COALESCE($12, activo)
         WHERE id = $1`,
        [
            id,
            datos.nombre ?? null,
            datos.montoPorCupon ?? null,
            'vigenteDesde' in datos,
            datos.vigenteDesde ?? null,
            'vigenteHasta' in datos,
            datos.vigenteHasta ?? null,
            'fechaSorteo' in datos,
            datos.fechaSorteo ?? null,
            'premios' in datos,
            datos.premios ?? null,
            typeof activo === 'boolean' ? activo : null,
        ]
    );
    res.json({ ok: true });
}

// GET /api/sorteos/:id/resumen  (dueno/encargado)
export async function resumenSorteo(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const s = await consultaDeEmpresa(empresaId, `${SELECT_SORTEO} WHERE s.id = $1`, [id]);
    if (!s.rows[0]) return res.status(404).json({ error: 'Sorteo no encontrado' });

    const totales = await consultaDeEmpresa(
        empresaId,
        `SELECT count(*) FILTER (WHERE NOT anulado) AS validos,
                count(*) FILTER (WHERE anulado) AS anulados,
                count(DISTINCT cliente_id) FILTER (WHERE NOT anulado) AS participantes
           FROM sorteo_cupones WHERE sorteo_id = $1`,
        [id]
    );
    const top = await consultaDeEmpresa(
        empresaId,
        `SELECT cliente_nombre, cliente_celular, count(*) AS cupones
           FROM sorteo_cupones WHERE sorteo_id = $1 AND NOT anulado
          GROUP BY cliente_id, cliente_nombre, cliente_celular
          ORDER BY count(*) DESC, cliente_nombre LIMIT 10`,
        [id]
    );
    const t = totales.rows[0];
    res.json({
        sorteo: sorteoParaFront(s.rows[0]),
        cuponesValidos: Number(t.validos),
        cuponesAnulados: Number(t.anulados),
        participantes: Number(t.participantes),
        topClientes: top.rows.map((f) => ({ nombre: f.cliente_nombre, celular: f.cliente_celular, cupones: Number(f.cupones) })),
    });
}

// GET /api/sorteos/:id/cupones?q=&anulados=1  (dueno/encargado): lista (tope 5000).
export async function listarCupones(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const q = String(req.query.q || '').trim();
    const incluirAnulados = req.query.anulados === '1';
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT c.numero, c.cliente_nombre, c.cliente_celular, c.anulado, c.creado_en, v.numero_ticket
           FROM sorteo_cupones c JOIN ventas v ON v.id = c.venta_id
          WHERE c.sorteo_id = $1 ${incluirAnulados ? '' : 'AND NOT c.anulado'}
            AND ($2 = '' OR unaccent(c.cliente_nombre) ILIKE unaccent('%' || $2 || '%')
                 OR c.cliente_celular ILIKE '%' || $2 || '%' OR c.numero::text = $2)
          ORDER BY c.numero LIMIT 5000`,
        [id, q]
    );
    res.json({ cupones: r.rows });
}

// GET /api/sorteos/:id/cupones/:numero  (dueno/encargado): verificar un papel
// sacado del buzon (existe?, esta anulado?, a quien llamar?).
export async function verificarCupon(req, res) {
    const { empresaId } = req.usuario;
    const { id, numero } = req.params;
    if (!/^\d+$/.test(numero)) return res.status(400).json({ error: 'Número de cupón inválido' });
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT c.numero, c.cliente_nombre, c.cliente_celular, c.anulado, c.creado_en,
                v.numero_ticket, v.total, v.anulada AS venta_anulada
           FROM sorteo_cupones c JOIN ventas v ON v.id = c.venta_id
          WHERE c.sorteo_id = $1 AND c.numero = $2`,
        [id, Number(numero)]
    );
    if (!r.rows[0]) return res.json({ existe: false });
    const f = r.rows[0];
    res.json({
        existe: true,
        valido: !f.anulado,
        numero: f.numero,
        clienteNombre: f.cliente_nombre,
        clienteCelular: f.cliente_celular,
        creadoEn: f.creado_en,
        numeroTicket: f.numero_ticket,
        total: Number(f.total),
        ventaAnulada: f.venta_anulada,
    });
}
