import pool, { consultaDeEmpresa } from '../config/db.js';

// sucursales tiene RLS - nunca se la puede tocar con pool.query crudo (ver
// el comentario grande sobre esto en usuariosController.js). El limite en
// si vive en empresas, que no tiene RLS, asi que esa parte si es directa.

// Cualquier rol logueado puede ver las sucursales de su empresa (para
// elegir en un selector, por ejemplo) — administrarlas es cosa de dueño.
export async function listarSucursales(req, res) {
    const { empresaId } = req.usuario;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT * FROM sucursales ORDER BY creado_en ASC`,
        []
    );
    res.json(resultado.rows);
}

// Cuantas sucursales activas tiene la empresa contra cuantas le permite
// su plan (limite_sucursales, lo sube el admin de la plataforma, no el
// propio dueño). Reemplaza al viejo booleano multi_sucursal_habilitado.
async function sucursalesDisponibles(empresaId) {
    const empresa = await pool.query(`SELECT limite_sucursales FROM empresas WHERE id = $1`, [empresaId]);
    const limite = Number(empresa.rows[0]?.limite_sucursales ?? 0);

    const activasResultado = await consultaDeEmpresa(
        empresaId,
        `SELECT COUNT(*) AS cantidad FROM sucursales WHERE activa = true`,
        []
    );
    const activas = Number(activasResultado.rows[0].cantidad);

    return { puede: activas < limite, limite };
}

// Crear/editar sucursales es una feature de plan: solo mientras haya
// margen contra limite_sucursales (lo sube el admin de la plataforma, no
// el propio dueño) se puede tener más de una. Sin eso, el endpoint se
// rechaza aunque alguien lo llame directo.
export async function crearSucursal(req, res) {
    const { empresaId } = req.usuario;
    const { nombre, puntoExpedicion, direccion } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    const { puede, limite } = await sucursalesDisponibles(empresaId);
    if (!puede) {
        return res.status(403).json({ error: `Tu plan permite hasta ${limite} sucursal(es)` });
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `INSERT INTO sucursales (empresa_id, nombre, punto_expedicion, direccion)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [empresaId, nombre.trim(), puntoExpedicion || null, direccion || null]
    );
    res.status(201).json(resultado.rows[0]);
}

export async function actualizarSucursal(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const { nombre, puntoExpedicion, direccion, activa } = req.body;

    const { puede, limite } = await sucursalesDisponibles(empresaId);
    if (!puede) {
        return res.status(403).json({ error: `Tu plan permite hasta ${limite} sucursal(es)` });
    }

    if (activa === false) {
        const activasResultado = await consultaDeEmpresa(
            empresaId,
            `SELECT COUNT(*) AS cantidad FROM sucursales WHERE activa = true AND id != $1`,
            [id]
        );
        if (Number(activasResultado.rows[0].cantidad) === 0) {
            return res.status(400).json({ error: 'No podés desactivar la única sucursal activa' });
        }
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `UPDATE sucursales SET
            nombre = COALESCE($2, nombre),
            punto_expedicion = COALESCE($3, punto_expedicion),
            direccion = COALESCE($4, direccion),
            activa = COALESCE($5, activa)
         WHERE id = $1
         RETURNING *`,
        [id, nombre, puntoExpedicion, direccion, activa]
    );
    if (!resultado.rows[0]) {
        return res.status(404).json({ error: 'Sucursal no encontrada' });
    }
    res.json(resultado.rows[0]);
}
