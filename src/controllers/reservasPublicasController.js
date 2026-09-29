// Endpoints públicos (sin autenticar) del módulo de Reservas públicas -
// calcado del único otro endpoint público de la app, verificacion.js.
// Todo acá se resuelve por :slug, nunca por un JWT: la clienta no tiene
// sesión de EMPREMAS. Cada función empieza resolviendo el salón y
// rechazando con 404 si el slug no existe o el módulo está apagado, para
// no distinguir "no existe" de "está apagado" de cara afuera.
import { consulta, consultaDeEmpresa, transaccionDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { celularNormalizado } from '../utils/celularNormalizado.js';
import { crearCitaCore } from './citasController.js';

// empresas no tiene RLS (tabla raíz, se necesita poder leerla antes de que
// exista cualquier contexto de tenant - mismo motivo por el que usuarios
// tampoco tiene RLS) - consulta() en vez de consultaDeEmpresa() a propósito.
async function resolverSalon(slug) {
    if (!slug) return null;
    const resultado = await consulta(
        `SELECT id, razon_social, nombre_fantasia, logo, foto_portada, reservas_publicas_habilitadas, citas_habilitadas
         FROM empresas WHERE slug = $1`,
        [slug]
    );
    const empresa = resultado.rows[0];
    if (!empresa || !empresa.reservas_publicas_habilitadas || !empresa.citas_habilitadas) {
        return null;
    }
    return empresa;
}

export async function obtenerSalonPublico(req, res) {
    const empresa = await resolverSalon(req.params.slug);
    if (!empresa) return res.status(404).json({ error: 'Página no encontrada' });
    res.json({
        nombre: empresa.nombre_fantasia || empresa.razon_social,
        logo: empresa.logo,
        fotoPortada: empresa.foto_portada,
    });
}

export async function listarServiciosPublico(req, res) {
    const empresa = await resolverSalon(req.params.slug);
    if (!empresa) return res.status(404).json({ error: 'Página no encontrada' });

    const servicios = await consultaDeEmpresa(
        empresa.id,
        `SELECT id, nombre, precio_contado, duracion_minutos
         FROM productos WHERE es_servicio = true AND activo = true ORDER BY nombre`,
        []
    );
    const fotos = await consultaDeEmpresa(
        empresa.id,
        `SELECT sf.producto_id, sf.url_imagen
         FROM servicio_fotos sf
         JOIN productos p ON p.id = sf.producto_id
         WHERE p.es_servicio = true AND sf.activo = true
         ORDER BY sf.orden, sf.creado_en`,
        []
    );
    const fotosPorProducto = new Map();
    for (const f of fotos.rows) {
        if (!fotosPorProducto.has(f.producto_id)) fotosPorProducto.set(f.producto_id, []);
        fotosPorProducto.get(f.producto_id).push(f.url_imagen);
    }
    res.json(servicios.rows.map((s) => ({ ...s, fotos: fotosPorProducto.get(s.id) || [] })));
}

export async function listarProfesionalesPublico(req, res) {
    const empresa = await resolverSalon(req.params.slug);
    if (!empresa) return res.status(404).json({ error: 'Página no encontrada' });

    const profesionales = await consultaDeEmpresa(
        empresa.id,
        `SELECT id, nombre FROM profesionales WHERE activo = true ORDER BY nombre`,
        []
    );
    res.json(profesionales.rows);
}

// Devuelve los horarios YA ocupados de ese profesional ese día - la
// pantalla pública arma la grilla de horarios candidatos (franja fija,
// ver el plan) y tacha los que se cruzan, con el mismo criterio de
// solapamiento que ya usa crearCitaCore.
export async function disponibilidadPublica(req, res) {
    const empresa = await resolverSalon(req.params.slug);
    if (!empresa) return res.status(404).json({ error: 'Página no encontrada' });

    const { profesionalId, fecha } = req.query;
    if (!profesionalId || !fecha) {
        return res.status(400).json({ error: 'Falta profesionalId o fecha' });
    }

    const ocupadas = await consultaDeEmpresa(
        empresa.id,
        `SELECT fecha_hora_inicio, duracion_minutos FROM citas
         WHERE profesional_id = $1 AND estado <> 'cancelada'
           AND fecha_hora_inicio >= $2::date AND fecha_hora_inicio < $2::date + interval '1 day'`,
        [profesionalId, fecha]
    );
    res.json(ocupadas.rows);
}

export async function crearCitaPublica(req, res) {
    const empresa = await resolverSalon(req.params.slug);
    if (!empresa) return res.status(404).json({ error: 'Página no encontrada' });

    const { nombreCliente, celular, consentimiento, servicioId, profesionalId, fechaHoraInicio } = req.body;

    if (!consentimiento) {
        return res.status(400).json({ error: 'Hace falta aceptar el uso de tus datos para poder reservar' });
    }
    if (!nombreCliente || !String(nombreCliente).trim()) {
        return res.status(400).json({ error: 'Falta tu nombre' });
    }
    const celularNormal = celularNormalizado(celular);
    if (!celularNormal) {
        return res.status(400).json({ error: 'Falta tu celular' });
    }

    try {
        const clienteId = await transaccionDeEmpresa(empresa.id, async (cliente) => {
            // Compara solo los ultimos 9 digitos (el numero movil paraguayo
            // real, sin importar si quedo guardado con 0 inicial, con 595,
            // con espacios o guiones) - una ficha ya cargada a mano por el
            // personal easi nunca esta en el mismo formato que lo que
            // escribe la clienta acá, así que un "=" exacto casi siempre
            // fallaría y duplicaría la ficha.
            const existente = await cliente.query(
                `SELECT id FROM clientes
                  WHERE activo = true AND right(regexp_replace(celular, '\\D', '', 'g'), 9) = right($1, 9)
                  ORDER BY creado_en DESC LIMIT 1`,
                [celularNormal]
            );
            if (existente.rows[0]) {
                return existente.rows[0].id;
            }
            const nuevo = await cliente.query(
                `INSERT INTO clientes (empresa_id, nombre, celular) VALUES ($1, $2, $3) RETURNING id`,
                [empresa.id, String(nombreCliente).trim(), celularNormal]
            );
            return nuevo.rows[0].id;
        });

        const cita = await crearCitaCore(empresa.id, {
            clienteId,
            productoId: servicioId,
            profesionalId,
            fechaHoraInicio,
            usuarioId: null,
        });
        res.status(201).json({ id: cita.id, fechaHoraInicio: cita.fecha_hora_inicio });
    } catch (err) {
        if (err instanceof ErrorNegocio) {
            return res.status(400).json({ error: err.message });
        }
        throw err;
    }
}
