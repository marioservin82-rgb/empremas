import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { turnoAbiertoDe } from './turnosController.js';

const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito'];

function validarPagos(pagos, monto) {
    if (!Array.isArray(pagos) || pagos.length === 0) {
        throw new ErrorNegocio('Elegí cómo se cobró: efectivo, transferencia, tarjeta de crédito o débito');
    }
    let suma = 0;
    for (const p of pagos) {
        if (!FORMAS_PAGO.includes(p.formaPago) || !(Number(p.monto) > 0)) {
            throw new ErrorNegocio('Cada pago necesita una forma de cobro válida y un monto mayor a cero');
        }
        suma += Number(p.monto);
    }
    if (Math.abs(suma - monto) > 0.01) {
        throw new ErrorNegocio(`Los pagos (Gs ${suma.toLocaleString('es-PY')}) no coinciden con el monto a cobrar (Gs ${monto.toLocaleString('es-PY')})`);
    }
}

// Facturas (ventas a credito) pendientes de un cliente, para elegir antes
// de cobrar a cual(es) corresponde el pago. numero_ticket/numero_formateado
// van igual que en crearCobro, para armar la misma etiqueta de referencia
// que ya usa el recibo ("Factura X" / "Ticket N° Y") en el selector.
export async function facturasPendientes(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT v.id, v.total, v.saldo_pendiente, v.vencimiento, v.creado_en,
                v.numero_ticket, de.numero_formateado AS de_numero_formateado
         FROM ventas v
         LEFT JOIN documentos_electronicos de ON de.venta_id = v.id AND de.estado = 'aprobado'
         WHERE v.cliente_id = $1 AND v.tipo_pago = 'credito' AND v.saldo_pendiente > 0
         ORDER BY v.vencimiento ASC, v.creado_en ASC`,
        [id]
    );

    res.json(resultado.rows);
}

// Registra un cobro (con recibo numerado) y lo aplica a las facturas que el
// usuario eligio (facturaIds), de la mas vencida a la mas nueva dentro de
// esa seleccion, hasta agotar el monto. El tope de cuanto se puede cobrar
// sigue siendo el saldo total del cliente (no la suma de lo seleccionado):
// clientes.saldo no siempre esta respaldado por una fila de ventas (saldo
// migrado/ajustado a mano via ajustes_saldo_cliente o importacion CSV), asi
// que limitar el cobro a la suma de facturas elegidas dejaria imposible de
// cobrar esa parte no rastreada. Si el monto supera lo que suman las
// facturas elegidas, el excedente baja clientes.saldo sin quedar aplicado
// a ninguna factura puntual (mismo comportamiento que ya existia).
export async function crearCobro(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id: clienteId } = req.params;
    const { monto, pagos, facturaIds } = req.body;

    if (!Array.isArray(facturaIds)) {
        return res.status(400).json({ error: 'facturaIds debe ser una lista (puede ser vacía si el cliente no tiene facturas pendientes)' });
    }

    if (!(Number(monto) > 0)) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    try {
        validarPagos(pagos, Number(monto));
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }

    try {
        const cobro = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const clienteResultado = await cliente.query(`SELECT nombre, saldo FROM clientes WHERE id = $1 FOR UPDATE`, [
                clienteId,
            ]);
            const clienteFila = clienteResultado.rows[0];
            if (!clienteFila) {
                throw new ErrorNegocio('El cliente no existe');
            }
            if (Number(monto) > Number(clienteFila.saldo)) {
                throw new ErrorNegocio(
                    `No te debe tanto: el saldo es Gs ${Number(clienteFila.saldo).toLocaleString('es-PY')}`
                );
            }

            // Numeracion correlativa: el UPDATE bloquea la fila de la empresa,
            // asi dos cobros al mismo tiempo nunca sacan el mismo numero.
            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_recibo = siguiente_numero_recibo + 1
                 WHERE id = $1
                 RETURNING siguiente_numero_recibo - 1 AS numero`,
                [empresaId]
            );
            const numeroRecibo = numeroResultado.rows[0].numero;
            const turnoId = await turnoAbiertoDe(cliente, usuarioId);

            const cobroInsertado = await cliente.query(
                `INSERT INTO cobros (empresa_id, cliente_id, usuario_id, turno_id, numero_recibo, monto)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, creado_en`,
                [empresaId, clienteId, usuarioId, turnoId, numeroRecibo, monto]
            );
            const cobroId = cobroInsertado.rows[0].id;

            for (const p of pagos) {
                await cliente.query(
                    `INSERT INTO cobro_pagos (empresa_id, cobro_id, forma_pago, monto) VALUES ($1, $2, $3, $4)`,
                    [empresaId, cobroId, p.formaPago, p.monto]
                );
            }

            // Facturas elegidas por el usuario (nunca todas las pendientes
            // sin preguntar, como antes) - numero_ticket/numero_formateado
            // se traen para armar la misma referencia que ya usa el recibo.
            let facturas = { rows: [] };
            if (facturaIds.length > 0) {
                facturas = await cliente.query(
                    `SELECT v.id, v.saldo_pendiente, v.numero_ticket, de.numero_formateado AS de_numero_formateado
                     FROM ventas v
                     LEFT JOIN documentos_electronicos de ON de.venta_id = v.id AND de.estado = 'aprobado'
                     WHERE v.id = ANY($1::uuid[]) AND v.cliente_id = $2 AND v.tipo_pago = 'credito' AND v.saldo_pendiente > 0
                     ORDER BY v.vencimiento ASC, v.creado_en ASC
                     FOR UPDATE OF v`,
                    [facturaIds, clienteId]
                );
                if (facturas.rows.length !== facturaIds.length) {
                    throw new ErrorNegocio('Una de las facturas elegidas ya no está pendiente — actualizá la pantalla e intentá de nuevo');
                }
            } else {
                // facturaIds vacio solo es valido si el cliente realmente no
                // tiene ninguna factura pendiente (saldo migrado/ajustado sin
                // ventas asociadas) - si tiene alguna, hay que elegir.
                const pendientesResultado = await cliente.query(
                    `SELECT 1 FROM ventas WHERE cliente_id = $1 AND tipo_pago = 'credito' AND saldo_pendiente > 0 LIMIT 1`,
                    [clienteId]
                );
                if (pendientesResultado.rows.length > 0) {
                    throw new ErrorNegocio('Elegí a qué factura(s) corresponde este pago');
                }
            }

            let restante = Number(monto);
            const aplicaciones = [];
            for (const factura of facturas.rows) {
                if (restante <= 0) break;
                const aplicado = Math.min(restante, Number(factura.saldo_pendiente));
                await cliente.query(`UPDATE ventas SET saldo_pendiente = saldo_pendiente - $2 WHERE id = $1`, [
                    factura.id,
                    aplicado,
                ]);
                await cliente.query(
                    `INSERT INTO cobro_aplicaciones (empresa_id, cobro_id, venta_id, monto_aplicado) VALUES ($1, $2, $3, $4)`,
                    [empresaId, cobroId, factura.id, aplicado]
                );
                aplicaciones.push({
                    ventaId: factura.id,
                    numeroTicket: factura.numero_ticket,
                    numeroFacturaLegal: factura.de_numero_formateado,
                    montoAplicado: aplicado,
                });
                restante -= aplicado;
            }
            // Si sobra (el cliente pago mas de lo que suman las facturas que
            // eligio, cubriendo tambien saldo no rastreado por ninguna
            // venta): el resto simplemente reduce el saldo general sin
            // quedar aplicado a una factura puntual.

            const saldoAnterior = Number(clienteFila.saldo);
            const saldoRestante = saldoAnterior - Number(monto);
            await cliente.query(`UPDATE clientes SET saldo = saldo - $2 WHERE id = $1`, [clienteId, monto]);

            return {
                id: cobroId,
                creadoEn: cobroInsertado.rows[0].creado_en,
                numeroRecibo,
                clienteId,
                clienteNombre: clienteFila.nombre,
                monto: Number(monto),
                pagos,
                aplicaciones,
                saldoAnterior,
                saldoRestante,
                clienteSaldoQuedaEnCero: saldoRestante <= 0.01,
            };
        });

        res.status(201).json(cobro);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

export async function listarCobros(req, res) {
    const { empresaId } = req.usuario;
    const { id: clienteId } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT id, numero_recibo, monto, creado_en FROM cobros WHERE cliente_id = $1 ORDER BY creado_en DESC LIMIT 100`,
        [clienteId]
    );

    res.json(resultado.rows);
}
