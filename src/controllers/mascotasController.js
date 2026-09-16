import { consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';

// Sin restriccion de sucursal, mismo criterio que Reparaciones: una mascota
// registrada hace meses sigue siendo consultable desde cualquier sucursal
// de la empresa.
export async function listarMascotas(req, res) {
    const { empresaId } = req.usuario;
    const q = (req.query.q || '').trim();
    const clienteId = req.query.clienteId || null;

    const condiciones = ['m.activo = true'];
    const valores = [];

    if (clienteId) {
        valores.push(clienteId);
        condiciones.push(`m.cliente_id = $${valores.length}`);
    }

    if (q) {
        valores.push(`%${q}%`);
        condiciones.push(
            `(m.nombre ILIKE $${valores.length} OR cl.nombre ILIKE $${valores.length} OR cl.documento ILIKE $${valores.length} OR cl.celular ILIKE $${valores.length})`
        );
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT m.*, cl.nombre AS cliente_nombre, cl.celular AS cliente_celular, cl.documento AS cliente_documento
         FROM mascotas m
         JOIN clientes cl ON cl.id = m.cliente_id
         WHERE ${condiciones.join(' AND ')}
         ORDER BY m.nombre ASC
         LIMIT 200`,
        valores
    );

    res.json(resultado.rows);
}

// Ficha completa: datos de la mascota + su historial (citas/tratamientos
// vinculados, vacunas aplicadas, internaciones) - todo en un solo pedido
// para no tener que ir pantalla por pantalla a armar la ficha.
export async function obtenerMascota(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT m.*, cl.nombre AS cliente_nombre, cl.documento AS cliente_documento, cl.celular AS cliente_celular
         FROM mascotas m
         JOIN clientes cl ON cl.id = m.cliente_id
         WHERE m.id = $1`,
        [id]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Mascota no encontrada' });
    }

    const citas = await consultaDeEmpresa(
        empresaId,
        `SELECT c.id, c.fecha_hora_inicio, c.estado, c.resultado, c.nota,
                p.nombre AS producto_nombre, pr.nombre AS profesional_nombre
         FROM citas c
         JOIN productos p ON p.id = c.producto_id
         JOIN profesionales pr ON pr.id = c.profesional_id
         WHERE c.mascota_id = $1
         ORDER BY c.fecha_hora_inicio DESC`,
        [id]
    );

    const vacunas = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM vacunas WHERE mascota_id = $1 ORDER BY fecha_aplicacion DESC`,
        [id]
    );

    const internaciones = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM internaciones WHERE mascota_id = $1 ORDER BY fecha_ingreso DESC`,
        [id]
    );

    res.json({
        ...resultado.rows[0],
        citas: citas.rows,
        vacunas: vacunas.rows,
        internaciones: internaciones.rows,
    });
}

export async function crearMascota(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { clienteId, nombre, especie, raza, fechaNacimiento, sexo, pesoKg, notas } = req.body;

    if (!clienteId) {
        return res.status(400).json({ error: 'Elegí a qué cliente pertenece la mascota' });
    }
    if (!nombre || !String(nombre).trim()) {
        return res.status(400).json({ error: 'El nombre de la mascota es obligatorio' });
    }
    if (!especie || !String(especie).trim()) {
        return res.status(400).json({ error: 'Indicá la especie (perro, gato, etc.)' });
    }

    try {
        const mascota = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const clienteResultado = await cliente.query(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
            if (!clienteResultado.rows[0]) {
                throw new ErrorNegocio('El cliente no existe');
            }

            const insertado = await cliente.query(
                `INSERT INTO mascotas (empresa_id, cliente_id, nombre, especie, raza, fecha_nacimiento, sexo, peso_kg, notas, usuario_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                    empresaId,
                    clienteId,
                    String(nombre).trim(),
                    String(especie).trim(),
                    raza || null,
                    fechaNacimiento || null,
                    sexo || null,
                    pesoKg || null,
                    notas || null,
                    usuarioId,
                ]
            );
            return insertado.rows[0];
        });
        res.status(201).json(mascota);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function actualizarMascota(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, especie, raza, fechaNacimiento, sexo, pesoKg, notas, activo } = req.body;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE mascotas SET
            nombre = COALESCE($2, nombre),
            especie = COALESCE($3, especie),
            raza = COALESCE($4, raza),
            fecha_nacimiento = COALESCE($5, fecha_nacimiento),
            sexo = COALESCE($6, sexo),
            peso_kg = COALESCE($7, peso_kg),
            notas = COALESCE($8, notas),
            activo = COALESCE($9, activo)
         WHERE id = $1
         RETURNING *`,
        [id, nombre, especie, raza, fechaNacimiento, sexo, pesoKg, notas, activo]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Mascota no encontrada' });
    }
    res.json(resultado.rows[0]);
}

// Se aplica una vacuna, directo desde la ficha - no depende de que haya
// una Cita agendada (muchas vacunas se aplican en el momento, sin turno
// previo). fechaProximoRefuerzo es opcional: sin ella, esta vacuna
// simplemente no aparece en el listado de alertas.
export async function crearVacuna(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id: mascotaId } = req.params;
    const { nombreVacuna, fechaAplicacion, fechaProximoRefuerzo, nota } = req.body;

    if (!nombreVacuna || !String(nombreVacuna).trim()) {
        return res.status(400).json({ error: 'Indicá qué vacuna se aplicó' });
    }
    if (!fechaAplicacion) {
        return res.status(400).json({ error: 'Indicá la fecha de aplicación' });
    }

    try {
        const vacuna = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const mascotaResultado = await cliente.query(`SELECT id FROM mascotas WHERE id = $1`, [mascotaId]);
            if (!mascotaResultado.rows[0]) {
                throw new ErrorNegocio('La mascota ya no existe');
            }
            const insertado = await cliente.query(
                `INSERT INTO vacunas (empresa_id, mascota_id, nombre_vacuna, fecha_aplicacion, fecha_proximo_refuerzo, nota, usuario_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [
                    empresaId,
                    mascotaId,
                    String(nombreVacuna).trim(),
                    fechaAplicacion,
                    fechaProximoRefuerzo || null,
                    nota || null,
                    usuarioId,
                ]
            );
            return insertado.rows[0];
        });
        res.status(201).json(vacuna);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Listado de refuerzos por vencer - mismo espiritu que clientesCumpleanos:
// se calculan los dias restantes al vuelo. A diferencia del cumpleaños (que
// se repite cada año), un refuerzo de vacuna es una fecha real que no se
// recalcula sola - por eso tambien entran los vencidos (diasFaltan negativo),
// que son justamente los mas urgentes de mostrar.
export async function vacunasPorVencer(req, res) {
    const { empresaId } = req.usuario;
    const rango = ['hoy', 'mes'].includes(req.query.rango) ? req.query.rango : 'semana';
    const limiteDias = rango === 'hoy' ? 0 : rango === 'mes' ? 31 : 7;

    // Un mismo tipo de vacuna puede haberse aplicado varias veces (se
    // renueva) - solo interesa el refuerzo de la aplicacion MAS RECIENTE de
    // cada (mascota, vacuna), para no seguir avisando de una fecha ya
    // superada por una aplicacion mas nueva.
    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT DISTINCT ON (v.mascota_id, v.nombre_vacuna)
                v.id, v.mascota_id, v.nombre_vacuna, v.fecha_aplicacion, v.fecha_proximo_refuerzo,
                m.nombre AS mascota_nombre, m.especie AS mascota_especie,
                cl.nombre AS cliente_nombre, cl.celular AS cliente_celular
         FROM vacunas v
         JOIN mascotas m ON m.id = v.mascota_id AND m.activo = true
         JOIN clientes cl ON cl.id = m.cliente_id
         WHERE v.fecha_proximo_refuerzo IS NOT NULL
         ORDER BY v.mascota_id, v.nombre_vacuna, v.fecha_aplicacion DESC`,
        []
    );

    const fechaBase = req.query.fecha ? new Date(`${req.query.fecha}T00:00:00Z`) : new Date();
    const hoyUTC = new Date(Date.UTC(fechaBase.getUTCFullYear(), fechaBase.getUTCMonth(), fechaBase.getUTCDate()));

    const conAlerta = resultado.rows
        .map((v) => {
            const refuerzo = new Date(v.fecha_proximo_refuerzo);
            const refuerzoUTC = new Date(Date.UTC(refuerzo.getUTCFullYear(), refuerzo.getUTCMonth(), refuerzo.getUTCDate()));
            const diasFaltan = Math.round((refuerzoUTC - hoyUTC) / 86400000);
            return {
                id: v.id,
                mascotaId: v.mascota_id,
                mascotaNombre: v.mascota_nombre,
                mascotaEspecie: v.mascota_especie,
                clienteNombre: v.cliente_nombre,
                clienteCelular: v.cliente_celular,
                nombreVacuna: v.nombre_vacuna,
                fechaProximoRefuerzo: v.fecha_proximo_refuerzo,
                diasFaltan,
                vencida: diasFaltan < 0,
            };
        })
        .filter((v) => v.diasFaltan <= limiteDias)
        .sort((a, b) => a.diasFaltan - b.diasFaltan);

    res.json(conAlerta);
}
