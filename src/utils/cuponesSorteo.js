import { ErrorNegocio } from './errorNegocio.js';
import { celularNormalizado } from './celularNormalizado.js';

// Sorteo con cupones: 1 cupon por cada `monto_por_cupon` Gs de compras al
// contado; el sobrante se acumula por cliente (sorteo_clientes). Todo corre
// dentro de la transaccion de la venta (el `client` que recibe cada funcion),
// asi un fallo en la venta tambien deshace los cupones.

// Sorteo activo y vigente hoy (fecha de Paraguay), o null. Solo si la empresa
// tiene el modulo habilitado por EMPREMAS.
export async function sorteoVigente(client, empresaId) {
    const r = await client.query(
        `SELECT s.*, to_char(s.fecha_sorteo, 'YYYY-MM-DD') AS fecha_sorteo_texto FROM sorteos s
          JOIN empresas e ON e.id = s.empresa_id
         WHERE s.empresa_id = $1 AND s.activo = true AND e.sorteos_habilitado = true
           AND (s.vigente_desde IS NULL OR s.vigente_desde <= (now() AT TIME ZONE 'America/Asuncion')::date)
           AND (s.vigente_hasta IS NULL OR s.vigente_hasta >= (now() AT TIME ZONE 'America/Asuncion')::date)`,
        [empresaId]
    );
    return r.rows[0] || null;
}

// Cliente que participa del sorteo, a partir de lo que cargo el cajero:
// - con cliente ya elegido: se le completa el celular si no tenia;
// - sin cliente: se busca por celular (ultimos 9 digitos, igual que las
//   reservas publicas) y si no existe se crea. Se hace aca (en el servidor) y no
//   desde el front porque el cajero no tiene permiso para crear clientes.
export async function clienteParaSorteo(client, empresaId, clienteId, datos) {
    const nombre = String(datos?.nombre || '').trim();
    const celular = celularNormalizado(datos?.celular);

    if (clienteId) {
        const fila = await client.query(`SELECT id, nombre, celular, es_generico FROM clientes WHERE id = $1`, [clienteId]);
        const c = fila.rows[0];
        if (!c) throw new ErrorNegocio('El cliente no existe');
        if (!c.celular && celular) {
            await client.query(`UPDATE clientes SET celular = $2 WHERE id = $1`, [clienteId, celular]);
            c.celular = celular;
        }
        if (!c.celular) throw new ErrorNegocio('Para participar del sorteo cargá el celular del cliente');
        return { id: c.id, nombre: c.nombre, celular: c.celular };
    }

    if (!nombre || !celular || celular.length < 12) {
        throw new ErrorNegocio('Para participar del sorteo cargá nombre y celular del cliente');
    }
    const existente = await client.query(
        `SELECT id, nombre, celular FROM clientes
          WHERE activo = true AND es_generico = false
            AND right(regexp_replace(celular, '\D', '', 'g'), 9) = right($1, 9)
          ORDER BY creado_en DESC LIMIT 1`,
        [celular]
    );
    if (existente.rows[0]) return existente.rows[0];
    const nuevo = await client.query(
        `INSERT INTO clientes (empresa_id, nombre, celular) VALUES ($1, $2, $3) RETURNING id, nombre, celular`,
        [empresaId, nombre, celular]
    );
    return nuevo.rows[0];
}

// Cantidad de cupones y sobrante nuevo para un pendiente + total (pura, la usa
// tambien el front para avisar antes de cerrar la venta).
export function calcularCupones(pendiente, total, montoPorCupon) {
    const base = Number(pendiente) + Number(total);
    const cupones = Math.floor(base / Number(montoPorCupon));
    return { cupones, pendienteNuevo: base - cupones * Number(montoPorCupon) };
}

export async function pendienteDeCliente(client, sorteoId, clienteId) {
    const r = await client.query(
        `SELECT monto_pendiente FROM sorteo_clientes WHERE sorteo_id = $1 AND cliente_id = $2`,
        [sorteoId, clienteId]
    );
    return Number(r.rows[0]?.monto_pendiente || 0);
}

// Emite los cupones de una venta contado. Devuelve { cupones: [...], pendiente }.
// Bloquea la fila del sorteo (numeracion correlativa sin duplicados) y la del
// acumulador del cliente.
export async function emitirCuponesDeVenta(client, { empresaId, sorteo, ventaId, cliente, total }) {
    await client.query(
        `INSERT INTO sorteo_clientes (empresa_id, sorteo_id, cliente_id, monto_pendiente)
         VALUES ($1, $2, $3, 0) ON CONFLICT (sorteo_id, cliente_id) DO NOTHING`,
        [empresaId, sorteo.id, cliente.id]
    );
    const acum = await client.query(
        `SELECT monto_pendiente FROM sorteo_clientes WHERE sorteo_id = $1 AND cliente_id = $2 FOR UPDATE`,
        [sorteo.id, cliente.id]
    );
    const { cupones: cantidad, pendienteNuevo } = calcularCupones(
        acum.rows[0].monto_pendiente, total, sorteo.monto_por_cupon
    );
    await client.query(
        `UPDATE sorteo_clientes SET monto_pendiente = $3 WHERE sorteo_id = $1 AND cliente_id = $2`,
        [sorteo.id, cliente.id, pendienteNuevo]
    );
    if (cantidad === 0) return { cupones: [], pendiente: pendienteNuevo };

    const numeracion = await client.query(
        `UPDATE sorteos SET siguiente_numero = siguiente_numero + $2 WHERE id = $1
         RETURNING siguiente_numero - $2 AS primero`,
        [sorteo.id, cantidad]
    );
    const primero = Number(numeracion.rows[0].primero);
    const cupones = [];
    for (let i = 0; i < cantidad; i++) {
        const numero = primero + i;
        await client.query(
            `INSERT INTO sorteo_cupones (empresa_id, sorteo_id, numero, venta_id, cliente_id, cliente_nombre, cliente_celular)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [empresaId, sorteo.id, numero, ventaId, cliente.id, cliente.nombre, cliente.celular]
        );
        cupones.push({ numero, clienteNombre: cliente.nombre, clienteCelular: cliente.celular });
    }
    return { cupones, pendiente: pendienteNuevo };
}

// Revierte la participacion de una venta en el sorteo (venta anulada o Nota
// de Credito total): anula sus cupones y devuelve el sobrante al cliente.
// Antes de la venta el cliente tenia p0, despues p1 = p0 + total - n*monto,
// asi que se revierte con p1 - total + n*monto (piso en 0 si hubo ventas
// posteriores que ya consumieron ese sobrante). Funciona tambien si la venta
// no dio cupones (n = 0): igual saca su aporte del acumulador.
export async function anularCuponesDeVenta(client, ventaId) {
    const v = await client.query(
        `SELECT v.sorteo_id, v.cliente_id, v.total, s.monto_por_cupon
           FROM ventas v JOIN sorteos s ON s.id = v.sorteo_id
          WHERE v.id = $1`,
        [ventaId]
    );
    if (!v.rows[0]) return 0;
    const { sorteo_id, cliente_id, total, monto_por_cupon } = v.rows[0];
    const cupones = await client.query(
        `UPDATE sorteo_cupones SET anulado = true WHERE venta_id = $1 AND anulado = false RETURNING id`,
        [ventaId]
    );
    await client.query(
        `UPDATE sorteo_clientes
            SET monto_pendiente = GREATEST(0, monto_pendiente - $3 + $4)
          WHERE sorteo_id = $1 AND cliente_id = $2`,
        [sorteo_id, cliente_id, total, cupones.rows.length * Number(monto_por_cupon)]
    );
    // Evita revertir dos veces si se vuelve a llamar (anulada + NC total).
    await client.query(`UPDATE ventas SET sorteo_id = NULL WHERE id = $1`, [ventaId]);
    return cupones.rows.length;
}
