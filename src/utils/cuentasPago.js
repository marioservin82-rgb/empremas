import { ErrorNegocio } from './errorNegocio.js';

// Cuenta bancaria / billetera de una transferencia (cobro o pago). Solo aplica
// a forma_pago = 'transferencia'. Si la empresa cargo cuentas, hay que elegir
// una; si no cargo ninguna, todo funciona como antes (sin cuenta).

// `ejecutar` es (sql, params) => Promise<{rows}>: client.query.bind(client)
// dentro de una transaccion, o (sql, p) => consultaDeEmpresa(empresaId, sql, p).
export async function contextoCuentas(ejecutar) {
    const r = await ejecutar(`SELECT id FROM cuentas_bancarias WHERE activa = true`, []);
    return { activas: new Set(r.rows.map((f) => f.id)) };
}

// -> { cuentaId, nroOperacion } listos para guardar.
export function cuentaDePago(ctx, formaPago, cuentaId, nroOperacion) {
    if (formaPago !== 'transferencia') return { cuentaId: null, nroOperacion: null };
    const nro = String(nroOperacion ?? '').trim().slice(0, 60) || null;
    if (ctx.activas.size === 0) return { cuentaId: null, nroOperacion: nro };
    if (!cuentaId) {
        throw new ErrorNegocio('Elegí la cuenta de la transferencia');
    }
    if (!ctx.activas.has(cuentaId)) {
        throw new ErrorNegocio('La cuenta elegida no existe o está desactivada');
    }
    return { cuentaId, nroOperacion: nro };
}
