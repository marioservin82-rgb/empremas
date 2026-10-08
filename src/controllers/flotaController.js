import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// Flota de transporte para las Notas de Remisión: vehículos y choferes propios
// de la empresa + transportistas externos (fleteros). Se eligen (o se cargan en
// el momento) al emitir una remisión.

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

// ---------- Lectura ----------

export async function listarFlota(req, res) {
    const { empresaId } = req.usuario;
    const [vehiculos, choferes, transportistas] = await Promise.all([
        consultaDeEmpresa(
            empresaId,
            `SELECT * FROM remision_vehiculos WHERE activo = true ORDER BY predeterminado DESC, creado_en`,
            []
        ),
        consultaDeEmpresa(
            empresaId,
            `SELECT * FROM remision_choferes WHERE activo = true ORDER BY predeterminado DESC, creado_en`,
            []
        ),
        consultaDeEmpresa(
            empresaId,
            `SELECT * FROM remision_transportistas WHERE activo = true ORDER BY creado_en`,
            []
        ),
    ]);
    res.json({
        vehiculos: vehiculos.rows,
        choferes: choferes.rows,
        transportistas: transportistas.rows,
    });
}

// ---------- Helpers de alta / dedupe (reutilizados por remisionesController) ----------

// Devuelve el id de un vehículo: si viene `vehiculoId` lo valida; si viene
// `vehiculoNuevo` busca uno con la misma chapa o lo crea. `cliente` es el
// cliente de la transacción.
export async function resolverVehiculo(cliente, empresaId, { vehiculoId, vehiculoNuevo }) {
    if (vehiculoId) {
        const r = await cliente.query(`SELECT * FROM remision_vehiculos WHERE id = $1 AND activo = true`, [vehiculoId]);
        if (!r.rows[0]) throw new ErrorNegocio('El vehículo elegido ya no existe');
        return r.rows[0];
    }
    const v = vehiculoNuevo || {};
    const tipo = String(v.tipo || '').trim().toUpperCase();
    const marca = String(v.marca || '').trim();
    const chapa = String(v.chapa || '').trim();
    if (!tipo || !marca || !chapa) throw new ErrorNegocio('El vehículo necesita tipo, marca y chapa');

    const existente = await cliente.query(
        `SELECT * FROM remision_vehiculos WHERE empresa_id = $1 AND upper(chapa) = upper($2)`,
        [empresaId, chapa]
    );
    if (existente.rows[0]) {
        if (!existente.rows[0].activo) {
            await cliente.query(`UPDATE remision_vehiculos SET activo = true WHERE id = $1`, [existente.rows[0].id]);
        }
        return existente.rows[0];
    }
    const ins = await cliente.query(
        `INSERT INTO remision_vehiculos (empresa_id, tipo, marca, chapa) VALUES ($1,$2,$3,$4) RETURNING *`,
        [empresaId, tipo.slice(0, 10), marca.slice(0, 10), chapa]
    );
    return ins.rows[0];
}

export async function resolverChofer(cliente, empresaId, { choferId, choferNuevo }) {
    if (choferId) {
        const r = await cliente.query(`SELECT * FROM remision_choferes WHERE id = $1 AND activo = true`, [choferId]);
        if (!r.rows[0]) throw new ErrorNegocio('El chofer elegido ya no existe');
        return r.rows[0];
    }
    const c = choferNuevo || {};
    const nombre = String(c.nombre || '').trim();
    const documento = soloDigitos(c.documentoNumero);
    const direccion = String(c.direccion || '').trim();
    if (nombre.length < 4 || !documento || direccion.length < 4) {
        throw new ErrorNegocio('El chofer necesita nombre (4+ letras), cédula y dirección (4+ letras)');
    }
    const existente = await cliente.query(
        `SELECT * FROM remision_choferes WHERE empresa_id = $1 AND documento_numero = $2`,
        [empresaId, documento]
    );
    if (existente.rows[0]) {
        if (!existente.rows[0].activo) {
            await cliente.query(`UPDATE remision_choferes SET activo = true WHERE id = $1`, [existente.rows[0].id]);
        }
        return existente.rows[0];
    }
    const ins = await cliente.query(
        `INSERT INTO remision_choferes (empresa_id, nombre, documento_numero, direccion) VALUES ($1,$2,$3,$4) RETURNING *`,
        [empresaId, nombre, documento, direccion]
    );
    return ins.rows[0];
}

export async function resolverTransportista(cliente, empresaId, { transportistaId, transportistaNuevo }) {
    if (transportistaId) {
        const r = await cliente.query(`SELECT * FROM remision_transportistas WHERE id = $1 AND activo = true`, [transportistaId]);
        if (!r.rows[0]) throw new ErrorNegocio('El transportista elegido ya no existe');
        return r.rows[0];
    }
    const t = transportistaNuevo || {};
    const contribuyente = !!t.contribuyente;
    const nombre = String(t.nombre || '').trim();
    const direccion = String(t.direccion || '').trim();
    if (!nombre || !direccion) throw new ErrorNegocio('El transportista necesita nombre y dirección');

    const ruc = contribuyente ? String(t.ruc || '').trim() : null;
    const documentoNumero = contribuyente ? null : soloDigitos(t.documentoNumero);
    if (contribuyente && !ruc) throw new ErrorNegocio('El transportista contribuyente necesita RUC');
    if (!contribuyente && !documentoNumero) throw new ErrorNegocio('El transportista necesita cédula');

    const existente = await cliente.query(
        `SELECT * FROM remision_transportistas
         WHERE empresa_id = $1 AND ($2::text IS NOT NULL AND ruc = $2 OR $3::text IS NOT NULL AND documento_numero = $3)`,
        [empresaId, ruc, documentoNumero]
    );
    if (existente.rows[0]) {
        if (!existente.rows[0].activo) {
            await cliente.query(`UPDATE remision_transportistas SET activo = true WHERE id = $1`, [existente.rows[0].id]);
        }
        return existente.rows[0];
    }
    const ins = await cliente.query(
        `INSERT INTO remision_transportistas
            (empresa_id, contribuyente, nombre, ruc, documento_tipo, documento_numero, direccion)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [empresaId, contribuyente, nombre, ruc, Number(t.documentoTipo) || 1, documentoNumero, direccion]
    );
    return ins.rows[0];
}

// ---------- CRUD manual (pantalla de Flota) ----------

async function marcarUnicoPredeterminado(cliente, tabla, empresaId, id) {
    await cliente.query(`UPDATE ${tabla} SET predeterminado = false WHERE empresa_id = $1`, [empresaId]);
    await cliente.query(`UPDATE ${tabla} SET predeterminado = true WHERE id = $1`, [id]);
}

export async function crearVehiculo(req, res) {
    const { empresaId } = req.usuario;
    try {
        const veh = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const v = await resolverVehiculo(cliente, empresaId, { vehiculoNuevo: req.body });
            if (req.body.predeterminado) await marcarUnicoPredeterminado(cliente, 'remision_vehiculos', empresaId, v.id);
            return v;
        });
        res.status(201).json(veh);
    } catch (e) {
        if (e instanceof ErrorNegocio) return res.status(400).json({ error: e.message });
        throw e;
    }
}

// Edicion de un registro de flota (corregir un dato mal escrito, activar/
// desactivar, marcar predeterminado). Solo cambia lo que viene en el body; un
// campo de texto que viene vacio se rechaza en vez de borrarse. Lo ya enviado
// a SIFEN no cambia (el XML esta firmado) - solo lo que se vuelve a mostrar o
// imprimir de remisiones viejas, que lee estos datos en vivo.
function textoEditado(valor, actual, etiqueta, minimo = 1) {
    if (valor === undefined) return actual;
    const limpio = String(valor).trim();
    if (limpio.length < minimo) {
        throw new ErrorNegocio(
            minimo > 1 ? `El campo ${etiqueta} necesita al menos ${minimo} letras` : `Completá el campo ${etiqueta}`
        );
    }
    return limpio;
}

export async function actualizarVehiculo(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const b = req.body || {};
    try {
        const veh = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actual = (await cliente.query(`SELECT * FROM remision_vehiculos WHERE id = $1`, [id])).rows[0];
            if (!actual) throw new ErrorNegocio('Vehículo no encontrado');
            const tipo = textoEditado(b.tipo, actual.tipo, 'tipo').toUpperCase().slice(0, 10);
            const marca = textoEditado(b.marca, actual.marca, 'marca').slice(0, 10);
            const chapa = textoEditado(b.chapa, actual.chapa, 'chapa');
            const r = await cliente.query(
                `UPDATE remision_vehiculos SET tipo = $2, marca = $3, chapa = $4, activo = COALESCE($5, activo)
                 WHERE id = $1 RETURNING *`,
                [id, tipo, marca, chapa, b.activo === undefined ? null : !!b.activo]
            );
            if (b.predeterminado) await marcarUnicoPredeterminado(cliente, 'remision_vehiculos', empresaId, id);
            return r.rows[0];
        });
        res.json(veh);
    } catch (e) {
        if (e instanceof ErrorNegocio) return res.status(400).json({ error: e.message });
        if (e.code === '23505') return res.status(400).json({ error: 'Ya hay otro vehículo cargado con esa chapa' });
        throw e;
    }
}

export async function crearChofer(req, res) {
    const { empresaId } = req.usuario;
    try {
        const chof = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const c = await resolverChofer(cliente, empresaId, { choferNuevo: req.body });
            if (req.body.predeterminado) await marcarUnicoPredeterminado(cliente, 'remision_choferes', empresaId, c.id);
            return c;
        });
        res.status(201).json(chof);
    } catch (e) {
        if (e instanceof ErrorNegocio) return res.status(400).json({ error: e.message });
        throw e;
    }
}

export async function actualizarChofer(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const b = req.body || {};
    try {
        const chof = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actual = (await cliente.query(`SELECT * FROM remision_choferes WHERE id = $1`, [id])).rows[0];
            if (!actual) throw new ErrorNegocio('Chofer no encontrado');
            const nombre = textoEditado(b.nombre, actual.nombre, 'nombre', 4);
            const direccion = textoEditado(b.direccion, actual.direccion, 'dirección', 4);
            const documento = b.documentoNumero === undefined ? actual.documento_numero : soloDigitos(b.documentoNumero);
            if (!documento) throw new ErrorNegocio('Completá el campo cédula');
            const r = await cliente.query(
                `UPDATE remision_choferes SET nombre = $2, documento_numero = $3, direccion = $4, activo = COALESCE($5, activo)
                 WHERE id = $1 RETURNING *`,
                [id, nombre, documento, direccion, b.activo === undefined ? null : !!b.activo]
            );
            if (b.predeterminado) await marcarUnicoPredeterminado(cliente, 'remision_choferes', empresaId, id);
            return r.rows[0];
        });
        res.json(chof);
    } catch (e) {
        if (e instanceof ErrorNegocio) return res.status(400).json({ error: e.message });
        if (e.code === '23505') return res.status(400).json({ error: 'Ya hay otro chofer cargado con esa cédula' });
        throw e;
    }
}

export async function crearTransportista(req, res) {
    const { empresaId } = req.usuario;
    try {
        const t = await transaccionDeEmpresa(empresaId, (cliente) =>
            resolverTransportista(cliente, empresaId, { transportistaNuevo: req.body })
        );
        res.status(201).json(t);
    } catch (e) {
        if (e instanceof ErrorNegocio) return res.status(400).json({ error: e.message });
        throw e;
    }
}

export async function actualizarTransportista(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const b = req.body || {};
    try {
        const t = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const actual = (await cliente.query(`SELECT * FROM remision_transportistas WHERE id = $1`, [id])).rows[0];
            if (!actual) throw new ErrorNegocio('Transportista no encontrado');
            const contribuyente = b.contribuyente === undefined ? actual.contribuyente : !!b.contribuyente;
            const nombre = textoEditado(b.nombre, actual.nombre, 'nombre');
            const direccion = textoEditado(b.direccion, actual.direccion, 'dirección');
            // Un transportista tiene RUC o cédula, nunca los dos: al cambiar de
            // uno a otro se limpia el que ya no corresponde.
            const ruc = contribuyente ? textoEditado(b.ruc, actual.ruc || '', 'RUC') : null;
            const documentoNumero = contribuyente
                ? null
                : b.documentoNumero === undefined
                  ? actual.documento_numero
                  : soloDigitos(b.documentoNumero);
            if (!contribuyente && !documentoNumero) throw new ErrorNegocio('Completá el campo cédula');
            const r = await cliente.query(
                `UPDATE remision_transportistas SET
                    contribuyente = $2, nombre = $3, ruc = $4, documento_numero = $5, direccion = $6,
                    documento_tipo = COALESCE($7, documento_tipo), activo = COALESCE($8, activo)
                 WHERE id = $1 RETURNING *`,
                [
                    id,
                    contribuyente,
                    nombre,
                    ruc,
                    documentoNumero,
                    direccion,
                    b.documentoTipo ? Number(b.documentoTipo) : null,
                    b.activo === undefined ? null : !!b.activo,
                ]
            );
            return r.rows[0];
        });
        res.json(t);
    } catch (e) {
        if (e instanceof ErrorNegocio) return res.status(400).json({ error: e.message });
        throw e;
    }
}
