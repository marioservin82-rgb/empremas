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

// Facturas (ventas a credito) pendientes de un cliente, para mostrar antes
// de cobrar y para saber a cuales aplicar el pago.
export async function facturasPendientes(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT id, total, saldo_pendiente, vencimiento, creado_en
         FROM ventas
         WHERE cliente_id = $1 AND tipo_pago = 'credito' AND saldo_pendiente > 0
         ORDER BY vencimiento ASC, creado_en ASC`,
        [id]
    );

    res.json(resultado.rows);
}

// Registra un cobro (con recibo numerado) y lo reparte automaticamente
// entre las facturas mas vencidas del cliente hasta agotar el monto.
export async function crearCobro(req, res) {
    const { empresaId, usuarioId } = req.usuario;
    const { id: clienteId } = req.params;
    const { monto, pagos } = req.body;

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

            // Reparto automatico: de la factura mas vencida a la mas nueva,
            // hasta agotar el monto cobrado. numero_ticket/numero_formateado
            // van con FOR UPDATE de todas formas por el saldo_pendiente de
            // ventas - de paso se trae la referencia para mostrar en el
            // recibo (factura legal si esta aprobada, si no el ticket).
            const facturas = await cliente.query(
                `SELECT v.id, v.saldo_pendiente, v.numero_ticket, de.numero_formateado AS de_numero_formateado
                 FROM ventas v
                 LEFT JOIN documentos_electronicos de ON de.venta_id = v.id AND de.estado = 'aprobado'
                 WHERE v.cliente_id = $1 AND v.tipo_pago = 'credito' AND v.saldo_pendiente > 0
                 ORDER BY v.vencimiento ASC, v.creado_en ASC
                 FOR UPDATE OF v`,
                [clienteId]
            );

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
            // Si sobra (el cliente pagaba mas de lo que sumaban sus facturas
            // "abiertas" pero menos que el saldo total — no deberia pasar si
            // saldo = suma de saldo_pendiente, pero se deja documentado):
            // el resto simplemente reduce el saldo general sin quedar
            // aplicado a una factura puntual.

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
