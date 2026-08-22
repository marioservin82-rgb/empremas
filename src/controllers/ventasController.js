import bcrypt from 'bcrypt';
import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { turnoAbiertoDe } from './turnosController.js';
import { tienePermiso } from '../utils/permisos.js';
import { emitirFacturaElectronica, descargarKude, ErrorSifen } from '../services/sifenService.js';
import { categoriaYVolumenDeCliente } from './clientesController.js';

const COLUMNA_PRECIO = {
    contado: 'precio_contado',
    credito: 'precio_credito',
    mayorista: 'precio_mayorista',
};

const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito'];

// 'factura_legal' solo se puede elegir si la empresa tiene SIFEN
// configurado (empresas.sifen_api_key) - se valida aparte en crearVenta,
// no en esta lista fija, porque depende de cada empresa.
const TIPOS_COMPROBANTE_DISPONIBLES = ['ticket_comun', 'a4', 'sin_comprobante'];

// Actualiza el documento electronico de una venta con el resultado de
// Sifende (o el error, si fallo) - se llama fuera de la transaccion de
// la venta a proposito: un problema de SIFEN no debe hacer perder la
// venta ya registrada, solo deja el DE en 'error' para reintentar.
async function emitirYActualizarDe({ empresaId, deId, apiKey, establecimiento, puntoExpedicion, venta, items, cliente }) {
    try {
        const resultado = await emitirFacturaElectronica({
            apiKey,
            establecimiento,
            puntoExpedicion,
            venta,
            items,
            cliente,
        });
        await consultaDeEmpresa(
            empresaId,
            `UPDATE documentos_electronicos SET estado = $2, cdc = $3, numero_formateado = $4, mensaje_error = NULL, actualizado_en = now() WHERE id = $1`,
            [deId, resultado.estado?.toLowerCase() || 'enviado', resultado.cdc, resultado.numeroFormateado]
        );
    } catch (error) {
        const mensaje = error instanceof ErrorSifen ? error.message : 'No se pudo conectar con SIFEN';
        await consultaDeEmpresa(
            empresaId,
            `UPDATE documentos_electronicos SET estado = 'error', mensaje_error = $2, actualizado_en = now() WHERE id = $1`,
            [deId, mensaje]
        );
    }
}

// Valida los pagos de una venta que no es fiado y calcula el vuelto.
// Permite pagos hibridos (ej. mitad efectivo, mitad tarjeta): solo el
// efectivo puede generar vuelto, porque no tiene sentido "dar vuelto" en
// tarjeta o transferencia.
function calcularVuelto(pagos, total) {
    if (!Array.isArray(pagos) || pagos.length === 0) {
        throw new ErrorNegocio('Elegí la forma de cobro: efectivo, transferencia, tarjeta de crédito o débito');
    }
    for (const p of pagos) {
        if (!FORMAS_PAGO.includes(p.formaPago) || !(Number(p.monto) > 0)) {
            throw new ErrorNegocio('Cada pago necesita una forma de cobro válida y un monto mayor a cero');
        }
    }

    const totalNoEfectivo = pagos
        .filter((p) => p.formaPago !== 'efectivo')
        .reduce((acumulado, p) => acumulado + Number(p.monto), 0);
    const totalEfectivo = pagos
        .filter((p) => p.formaPago === 'efectivo')
        .reduce((acumulado, p) => acumulado + Number(p.monto), 0);

    if (totalNoEfectivo > total) {
        throw new ErrorNegocio(
            `Lo cobrado por tarjeta/transferencia (Gs ${totalNoEfectivo.toLocaleString('es-PY')}) no puede superar el total (Gs ${total.toLocaleString('es-PY')})`
        );
    }

    const faltaCubrirConEfectivo = total - totalNoEfectivo;
    if (totalEfectivo < faltaCubrirConEfectivo) {
        const falta = faltaCubrirConEfectivo - totalEfectivo;
        throw new ErrorNegocio(`Faltan Gs ${falta.toLocaleString('es-PY')} para cubrir el total`);
    }

    return totalEfectivo - faltaCubrirConEfectivo;
}

// Para la entrega inicial (opcional) de una venta a credito: a diferencia
// de calcularVuelto, un array vacio es valido (nada pagado ahora, todo
// fiado) - no exige cubrir ningun monto en particular.
function validarYSumarPagos(pagos) {
    if (!Array.isArray(pagos) || pagos.length === 0) {
        return 0;
    }
    for (const p of pagos) {
        if (!FORMAS_PAGO.includes(p.formaPago) || !(Number(p.monto) > 0)) {
            throw new ErrorNegocio('Cada pago necesita una forma de cobro válida y un monto mayor a cero');
        }
    }
    return pagos.reduce((acumulado, p) => acumulado + Number(p.monto), 0);
}

export async function crearVenta(req, res) {
    const { empresaId, usuarioId, sucursalId } = req.usuario;
    const { clienteId, tipoPago, pagos, items, tipoComprobante, presupuestoId } = req.body;
    const comprobante = tipoComprobante || 'ticket_comun';

    if (!COLUMNA_PRECIO[tipoPago]) {
        return res.status(400).json({ error: 'tipoPago debe ser contado, credito o mayorista' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'La venta necesita al menos un producto' });
    }
    if (tipoPago === 'credito' && !clienteId) {
        return res.status(400).json({ error: 'Un fiado necesita un cliente' });
    }
    if (!TIPOS_COMPROBANTE_DISPONIBLES.includes(comprobante) && comprobante !== 'factura_legal') {
        return res.status(400).json({ error: 'tipoComprobante debe ser ticket_comun, a4, sin_comprobante o factura_legal' });
    }

    let deParaEmitir = null;

    try {
        const venta = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const empresaResultado = await cliente.query(
                `SELECT permitir_venta_sin_stock, plazo_credito_dias, sifen_api_key, sifen_establecimiento
                 FROM empresas WHERE id = $1`,
                [empresaId]
            );
            const permitirVentaSinStock = empresaResultado.rows[0]?.permitir_venta_sin_stock ?? false;
            const plazoCreditoDias = empresaResultado.rows[0]?.plazo_credito_dias ?? 30;
            const sifenApiKey = empresaResultado.rows[0]?.sifen_api_key;
            const sifenEstablecimiento = empresaResultado.rows[0]?.sifen_establecimiento;

            if (comprobante === 'factura_legal' && !sifenApiKey) {
                throw new ErrorNegocio(
                    'Factura Legal todavía no está disponible: configurá SIFEN en Configuración → Facturación electrónica'
                );
            }

            const columnaPrecio = COLUMNA_PRECIO[tipoPago];
            let total = 0;
            const itemsCalculados = [];

            // Toda venta necesita un comprador. Si no se eligio uno puntual,
            // se usa el "Consumidor Final" generico de la empresa. Se
            // resuelve ANTES del loop de items (se movio desde mas abajo)
            // porque los beneficios de categoria de fidelizacion, calculados
            // acá mismo, tienen que estar listos antes de calcular el precio
            // de cada item.
            let clienteIdFinal = clienteId;
            if (!clienteIdFinal) {
                const generico = await cliente.query(
                    `SELECT id FROM clientes WHERE empresa_id = $1 AND es_generico = true LIMIT 1`,
                    [empresaId]
                );
                clienteIdFinal = generico.rows[0]?.id;
                if (!clienteIdFinal) {
                    throw new ErrorNegocio('No se encontró el cliente "Consumidor Final" de la empresa');
                }
            }

            // Beneficios de la categoria de fidelizacion del cliente (ver
            // clientesController.categoriaYVolumenDeCliente) - solo se
            // calculan si se eligio un cliente puntual, nunca para el
            // "Consumidor Final" generico (agrupa compradores anonimos, no
            // una persona identificable cuyo historial tenga sentido
            // premiar).
            let beneficios = { mayoristaAutomatico: false, descuentoPct: 0, lineaCreditoExtra: 0 };
            if (clienteId) {
                const { categoria } = await categoriaYVolumenDeCliente(cliente.query.bind(cliente), empresaId, clienteIdFinal);
                if (categoria) {
                    beneficios = {
                        mayoristaAutomatico: categoria.beneficio_mayorista_automatico,
                        descuentoPct: Number(categoria.beneficio_descuento_adicional_pct || 0),
                        lineaCreditoExtra: Number(categoria.beneficio_linea_credito_extra || 0),
                    };
                }
            }

            // FOR UPDATE: bloquea la fila de stock (de esta sucursal) hasta
            // que termine la transaccion, asi dos ventas al mismo tiempo no
            // descuentan el mismo stock dos veces sin verlo.
            for (const { productoId, cantidad, precioUnitario: precioDelPresupuesto, esMayorista } of items) {
                if (!(cantidad > 0)) {
                    throw new ErrorNegocio('La cantidad debe ser mayor a cero');
                }
                const productoResultado = await cliente.query(
                    `SELECT nombre, tasa_iva, precio_costo, ${columnaPrecio} AS precio, precio_mayorista FROM productos WHERE id = $1`,
                    [productoId]
                );
                const producto = productoResultado.rows[0];
                if (!producto) {
                    throw new ErrorNegocio('Uno de los productos ya no existe');
                }

                // Si esta sucursal todavia no tiene fila de stock para este
                // producto (ej. nunca se vendio ahi), la crea en 0 antes de
                // bloquearla.
                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, 0)
                     ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                    [empresaId, productoId, sucursalId]
                );
                const stockResultado = await cliente.query(
                    `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                    [productoId, sucursalId]
                );
                const stockActual = Number(stockResultado.rows[0].stock);

                if (!permitirVentaSinStock && stockActual < cantidad) {
                    throw new ErrorNegocio(`No hay suficiente stock de "${producto.nombre}"`);
                }
                // El precio cotizado en un presupuesto (posiblemente editado a
                // mano) se respeta al convertir a venta, en vez de recalcular
                // con el precio de catalogo actual. Fuera de esa conversion,
                // el precio siempre sale del catalogo — nunca de lo que mande
                // el cliente HTTP. La marca esMayorista por item (manual o por
                // el beneficio automatico de categoria) solo tiene efecto en
                // una venta al contado (no en credito) y nunca pisa el precio
                // ya congelado de un presupuesto.
                const vienDePresupuesto = presupuestoId && precioDelPresupuesto != null;
                const usaMayoristaPorItem =
                    tipoPago === 'contado' && (!!esMayorista || beneficios.mayoristaAutomatico) && !vienDePresupuesto;
                let precioUnitario = vienDePresupuesto
                    ? Number(precioDelPresupuesto)
                    : usaMayoristaPorItem
                    ? Number(producto.precio_mayorista)
                    : Number(producto.precio);
                // Descuento adicional de categoria: nunca pisa un precio ya
                // congelado de presupuesto, redondeado a guarani entero
                // (moneda sin decimales en la practica, igual que el resto
                // de los precios de la app).
                if (!vienDePresupuesto && beneficios.descuentoPct > 0) {
                    precioUnitario = Math.round(precioUnitario * (1 - beneficios.descuentoPct / 100));
                }
                const subtotal = precioUnitario * cantidad;
                total += subtotal;
                itemsCalculados.push({
                    productoId,
                    cantidad,
                    precioUnitario,
                    // Foto del costo promedio ponderado al momento de la
                    // venta (ver venta_items.costo_unitario en el schema) -
                    // si el costo cambia despues, el margen de esta venta ya
                    // vendida no se mueve retroactivamente.
                    costoUnitario: Number(producto.precio_costo),
                    esMayorista: usaMayoristaPorItem,
                    subtotal,
                    nombre: producto.nombre,
                    tasa_iva: producto.tasa_iva,
                });
            }

            // Se manda de vuelta en la respuesta (ver mas abajo) para que el
            // ticket pueda imprimir el saldo acumulado del cliente despues de
            // esta compra - pedido explicito para despensas/almacenes que
            // fian: el cliente se va sabiendo cuanto debe en total y cuanto
            // credito le queda, no solo lo de esta venta puntual.
            let infoCredito = null;
            // Cuanto de la venta queda fiado (0 si no es credito). En
            // credito arranca en "todo el total" y baja si hay entrega
            // inicial (pago parcial al momento, ver abajo).
            let montoFiado = 0;
            if (tipoPago === 'credito') {
                const resultado = await cliente.query(
                    `SELECT linea_credito, saldo FROM clientes WHERE id = $1 FOR UPDATE`,
                    [clienteIdFinal]
                );
                const c = resultado.rows[0];
                if (!c) {
                    throw new ErrorNegocio('El cliente ya no existe');
                }

                // Entrega inicial opcional: el cliente paga una parte ahora
                // (efectivo/transferencia/tarjeta) y el resto queda fiado -
                // solo esa parte fiada consume linea de credito.
                const entregaInicial = validarYSumarPagos(pagos);
                if (entregaInicial > total) {
                    throw new ErrorNegocio('La entrega inicial no puede ser mayor al total de la venta');
                }
                montoFiado = total - entregaInicial;

                // lineaCreditoExtra del beneficio de categoria suma acá -
                // mismo numero que ya calcula conSaldoDisponibleYCategoria
                // para lo que ve el cajero en pantalla al elegir el cliente,
                // para que nunca se rechace en el momento un crédito que la
                // ficha le mostró como disponible.
                const lineaCreditoEfectiva = Number(c.linea_credito) + beneficios.lineaCreditoExtra;
                const disponible = lineaCreditoEfectiva - Number(c.saldo);
                if (montoFiado > disponible) {
                    throw new ErrorNegocio(
                        `Crédito insuficiente: disponible Gs ${disponible.toLocaleString('es-PY')}, el saldo a fiar es de Gs ${montoFiado.toLocaleString('es-PY')}`
                    );
                }
                await cliente.query(`UPDATE clientes SET saldo = saldo + $2 WHERE id = $1`, [clienteIdFinal, montoFiado]);
                const nuevoSaldo = Number(c.saldo) + montoFiado;
                infoCredito = {
                    entregaInicial,
                    montoFiado,
                    clienteSaldo: nuevoSaldo,
                    clienteLineaCredito: lineaCreditoEfectiva,
                    clienteSaldoDisponible: lineaCreditoEfectiva - nuevoSaldo,
                };
            }

            const vuelto = tipoPago === 'credito' ? null : calcularVuelto(pagos, total);
            const turnoId = await turnoAbiertoDe(cliente, usuarioId);
            if (!turnoId) {
                throw new ErrorNegocio('Tenés que abrir la caja antes de vender.');
            }

            const vencimiento =
                tipoPago === 'credito'
                    ? new Date(Date.now() + Number(plazoCreditoDias) * 86400000).toISOString().slice(0, 10)
                    : null;

            // Numeracion correlativa del ticket (independiente del CDC de
            // SIFEN): el UPDATE bloquea la fila de la empresa, asi dos
            // ventas al mismo tiempo nunca sacan el mismo numero.
            const numeroResultado = await cliente.query(
                `UPDATE empresas SET siguiente_numero_ticket = siguiente_numero_ticket + 1
                 WHERE id = $1
                 RETURNING siguiente_numero_ticket - 1 AS numero`,
                [empresaId]
            );
            const numeroTicket = numeroResultado.rows[0].numero;

            const ventaInsertada = await cliente.query(
                `INSERT INTO ventas (empresa_id, cliente_id, usuario_id, turno_id, sucursal_id, numero_ticket, tipo_pago, vuelto, total, vencimiento, saldo_pendiente, tipo_comprobante, presupuesto_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING id, creado_en`,
                [
                    empresaId,
                    clienteIdFinal,
                    usuarioId,
                    turnoId,
                    sucursalId,
                    numeroTicket,
                    tipoPago,
                    vuelto,
                    total,
                    vencimiento,
                    montoFiado,
                    comprobante,
                    presupuestoId || null,
                ]
            );
            const ventaId = ventaInsertada.rows[0].id;

            // Se guardan tambien en credito si hubo entrega inicial (ver
            // arriba) - sin esto, esa plata no aparecia en la reconciliacion
            // de caja (efectivoEsperadoDeTurno suma venta_pagos).
            for (const p of pagos || []) {
                await cliente.query(
                    `INSERT INTO venta_pagos (empresa_id, venta_id, forma_pago, monto) VALUES ($1, $2, $3, $4)`,
                    [empresaId, ventaId, p.formaPago, p.monto]
                );
            }

            for (const item of itemsCalculados) {
                await cliente.query(
                    `INSERT INTO venta_items (empresa_id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, es_mayorista)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        empresaId,
                        ventaId,
                        item.productoId,
                        item.cantidad,
                        item.precioUnitario,
                        item.subtotal,
                        item.costoUnitario,
                        item.esMayorista,
                    ]
                );
                await cliente.query(
                    `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                    [item.productoId, sucursalId, item.cantidad]
                );
            }

            if (comprobante === 'factura_legal') {
                const deInsertado = await cliente.query(
                    `INSERT INTO documentos_electronicos (empresa_id, venta_id) VALUES ($1, $2) RETURNING id`,
                    [empresaId, ventaId]
                );
                const clienteResultado = await cliente.query(
                    `SELECT nombre, documento, es_generico FROM clientes WHERE id = $1`,
                    [clienteIdFinal]
                );
                const sucursalResultado = await cliente.query(
                    `SELECT punto_expedicion FROM sucursales WHERE id = $1`,
                    [sucursalId]
                );
                // Se guarda para emitir a Sifende DESPUES de que esta
                // transaccion confirme - un problema de SIFEN no debe hacer
                // fallar/perder la venta ya registrada.
                deParaEmitir = {
                    deId: deInsertado.rows[0].id,
                    apiKey: sifenApiKey,
                    establecimiento: sifenEstablecimiento,
                    puntoExpedicion: sucursalResultado.rows[0]?.punto_expedicion || 1,
                    venta: { tipoPago, pagos: pagos || [] },
                    items: itemsCalculados,
                    cliente: clienteResultado.rows[0],
                };
            }

            return {
                id: ventaId,
                creadoEn: ventaInsertada.rows[0].creado_en,
                numeroTicket,
                tipoPago,
                tipoComprobante: comprobante,
                pagos: pagos || [],
                clienteId: clienteIdFinal,
                vuelto,
                vencimiento,
                saldoPendiente: montoFiado,
                total,
                items: itemsCalculados,
                ...infoCredito,
            };
        });

        if (deParaEmitir) {
            await emitirYActualizarDe({ empresaId, ...deParaEmitir });
        }

        res.status(201).json({ ...venta, tieneDocumentoElectronico: !!deParaEmitir });
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Reintenta el envio a Sifende de una venta cuyo documento electronico
// quedo en 'error' (SIFEN caido, timeout, etc. - ver emitirYActualizarDe).
export async function reintentarSifen(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const datos = await consultaDeEmpresa(
        empresaId,
        `SELECT de.id AS de_id, de.estado AS de_estado,
                v.tipo_pago, v.sucursal_id, v.cliente_id,
                e.sifen_api_key, e.sifen_establecimiento,
                s.punto_expedicion,
                c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.es_generico AS cliente_es_generico
         FROM documentos_electronicos de
         JOIN ventas v ON v.id = de.venta_id
         JOIN empresas e ON e.id = v.empresa_id
         LEFT JOIN sucursales s ON s.id = v.sucursal_id
         LEFT JOIN clientes c ON c.id = v.cliente_id
         WHERE de.venta_id = $1`,
        [id]
    );
    const fila = datos.rows[0];
    if (!fila) {
        return res.status(404).json({ error: 'Esta venta no tiene un documento electrónico asociado' });
    }
    if (fila.de_estado !== 'error') {
        return res.status(400).json({ error: 'Este documento no está en estado de error' });
    }
    if (!fila.sifen_api_key) {
        return res.status(400).json({ error: 'SIFEN ya no está configurado para esta empresa' });
    }

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT vi.producto_id, vi.cantidad, vi.precio_unitario AS "precioUnitario", p.nombre, p.tasa_iva
         FROM venta_items vi
         JOIN productos p ON p.id = vi.producto_id
         WHERE vi.venta_id = $1`,
        [id]
    );
    const pagos = await consultaDeEmpresa(
        empresaId,
        `SELECT forma_pago AS "formaPago", monto FROM venta_pagos WHERE venta_id = $1`,
        [id]
    );

    await emitirYActualizarDe({
        empresaId,
        deId: fila.de_id,
        apiKey: fila.sifen_api_key,
        establecimiento: fila.sifen_establecimiento,
        puntoExpedicion: fila.punto_expedicion || 1,
        venta: { tipoPago: fila.tipo_pago, pagos: pagos.rows },
        items: items.rows,
        cliente: { nombre: fila.cliente_nombre, documento: fila.cliente_documento, es_generico: fila.cliente_es_generico },
    });

    const actualizado = await consultaDeEmpresa(
        empresaId,
        `SELECT estado, cdc, numero_formateado, mensaje_error FROM documentos_electronicos WHERE id = $1`,
        [fila.de_id]
    );
    res.json(actualizado.rows[0]);
}

// Descarga el KuDE (PDF con QR) de la Factura Legal de una venta, solo
// disponible una vez que SIFEN la aprobo. El PDF en si no se guarda en
// EMPREMAS - se pide a Sifende al vuelo cada vez.
export async function descargarKudeVenta(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const datos = await consultaDeEmpresa(
        empresaId,
        `SELECT de.estado, de.cdc, e.sifen_api_key
         FROM documentos_electronicos de
         JOIN empresas e ON e.id = de.empresa_id
         WHERE de.venta_id = $1`,
        [id]
    );
    const fila = datos.rows[0];
    if (!fila || !fila.cdc) {
        return res.status(404).json({ error: 'Esta venta no tiene un documento electrónico aprobado' });
    }
    if (fila.estado !== 'aprobado') {
        return res.status(400).json({ error: 'El documento todavía no fue aprobado por SIFEN' });
    }

    const pdf = await descargarKude({ apiKey: fila.sifen_api_key, cdc: fila.cdc });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
}

export async function listarVentas(req, res) {
    const { empresaId } = req.usuario;
    const { q, desde, hasta } = req.query;

    const condiciones = [];
    const valores = [];

    if (q) {
        valores.push(`%${q}%`, `%${q}%`);
        condiciones.push(`(c.documento LIKE $${valores.length - 1} OR unaccent(lower(c.nombre)) LIKE unaccent(lower($${valores.length})))`);
    }
    if (desde) {
        valores.push(desde);
        condiciones.push(`v.creado_en >= $${valores.length}::date`);
    }
    if (hasta) {
        // hasta es inclusive: hasta el final de ese dia.
        valores.push(hasta);
        condiciones.push(`v.creado_en < ($${valores.length}::date + INTERVAL '1 day')`);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT v.*, c.nombre AS cliente_nombre
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         ${where}
         ORDER BY v.creado_en DESC LIMIT 200`,
        valores
    );

    res.json(resultado.rows);
}

// Resumen de ventas de un dia puntual (por defecto hoy), pensado para
// consultar a distancia como acompañante del cierre de caja: totales
// grandes arriba, detalle venta por venta abajo (items, forma de pago,
// cliente si es fiado, cajero). Mismo criterio de alcance que
// listarRetirosDeTurno: dueño/encargado/ver_reportes ven todo (y pueden
// filtrar por sucursal); un cajero sin ese permiso solo ve sus propias
// ventas del dia, sin importar que sucursalId mande.
export async function resumenDia(req, res) {
    const { empresaId, usuarioId, rol } = req.usuario;
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const sucursalIdPedido = req.query.sucursalId || null;

    const puedeVerTodo = rol === 'dueno' || rol === 'encargado' || (await tienePermiso(empresaId, usuarioId, 'ver_reportes'));

    const condiciones = [`v.anulada = false`, `v.creado_en >= $1::date`, `v.creado_en < ($1::date + INTERVAL '1 day')`];
    const valores = [fecha];

    if (!puedeVerTodo) {
        valores.push(usuarioId);
        condiciones.push(`v.usuario_id = $${valores.length}`);
    } else if (sucursalIdPedido) {
        valores.push(sucursalIdPedido);
        condiciones.push(`v.sucursal_id = $${valores.length}`);
    }

    const ventas = await consultaDeEmpresa(
        empresaId,
        `SELECT v.id, v.numero_ticket, v.tipo_pago, v.total, v.creado_en,
                c.nombre AS cliente_nombre, u.nombre AS usuario_nombre
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         JOIN usuarios u ON u.id = v.usuario_id
         WHERE ${condiciones.join(' AND ')}
         ORDER BY v.creado_en ASC`,
        valores
    );

    const ventaIds = ventas.rows.map((v) => v.id);

    let items = { rows: [] };
    let pagos = { rows: [] };
    if (ventaIds.length > 0) {
        items = await consultaDeEmpresa(
            empresaId,
            `SELECT vi.venta_id, vi.cantidad, vi.precio_unitario, p.nombre AS producto_nombre
             FROM venta_items vi JOIN productos p ON p.id = vi.producto_id
             WHERE vi.venta_id = ANY($1::uuid[])`,
            [ventaIds]
        );
        pagos = await consultaDeEmpresa(
            empresaId,
            `SELECT venta_id, forma_pago, monto FROM venta_pagos WHERE venta_id = ANY($1::uuid[])`,
            [ventaIds]
        );
    }

    const itemsPorVenta = new Map();
    for (const item of items.rows) {
        if (!itemsPorVenta.has(item.venta_id)) itemsPorVenta.set(item.venta_id, []);
        itemsPorVenta.get(item.venta_id).push(item);
    }
    const pagosPorVenta = new Map();
    for (const pago of pagos.rows) {
        if (!pagosPorVenta.has(pago.venta_id)) pagosPorVenta.set(pago.venta_id, []);
        pagosPorVenta.get(pago.venta_id).push(pago);
    }

    const detalle = ventas.rows.map((v) => ({
        ...v,
        items: itemsPorVenta.get(v.id) || [],
        pagos: pagosPorVenta.get(v.id) || [],
    }));

    // Mismo criterio ya usado en obtenerBalanceMensual: "contado" es todo
    // lo que no es credito (incluye mayorista, que tambien se cobra en el
    // momento, solo con otro precio).
    const totalVendido = ventas.rows.reduce((acumulado, v) => acumulado + Number(v.total), 0);
    const totalCredito = ventas.rows
        .filter((v) => v.tipo_pago === 'credito')
        .reduce((acumulado, v) => acumulado + Number(v.total), 0);
    const totalContado = totalVendido - totalCredito;

    res.json({
        fecha,
        puedeVerTodo,
        totalVendido,
        totalContado,
        totalCredito,
        cantidadVentas: ventas.rows.length,
        ventas: detalle,
    });
}

// Solo las ventas que se facturaron como Factura Legal (SIFEN) - vista
// separada de /ventas para lo fiscal, sin mezclarse con tickets comunes.
export async function listarFacturasElectronicas(req, res) {
    const { empresaId } = req.usuario;
    const { desde, hasta } = req.query;

    const condiciones = [`v.tipo_comprobante = 'factura_legal'`];
    const valores = [];
    if (desde) {
        valores.push(desde);
        condiciones.push(`v.creado_en >= $${valores.length}::date`);
    }
    if (hasta) {
        valores.push(hasta);
        condiciones.push(`v.creado_en < ($${valores.length}::date + INTERVAL '1 day')`);
    }

    const resultado = await consultaDeEmpresa(
        empresaId,
        `SELECT v.id, v.numero_ticket, v.total, v.creado_en, v.anulada,
                c.nombre AS cliente_nombre,
                de.estado AS de_estado, de.cdc AS de_cdc, de.numero_formateado AS de_numero_formateado,
                de.mensaje_error AS de_mensaje_error
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN documentos_electronicos de ON de.venta_id = v.id
         WHERE ${condiciones.join(' AND ')}
         ORDER BY v.creado_en DESC LIMIT 200`,
        valores
    );

    res.json(resultado.rows);
}

// Para reimprimir/reenviar un comprobante: trae la venta con cliente,
// items y pagos, con la misma forma que espera Recibo.js.
export async function obtenerVenta(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const venta = await consultaDeEmpresa(
        empresaId,
        `SELECT v.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.celular AS cliente_celular,
                c.direccion AS cliente_direccion,
                u.nombre AS anulada_por_nombre,
                de.estado AS de_estado, de.cdc AS de_cdc, de.numero_formateado AS de_numero_formateado,
                de.mensaje_error AS de_mensaje_error
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.anulada_por
         LEFT JOIN documentos_electronicos de ON de.venta_id = v.id
         WHERE v.id = $1`,
        [id]
    );
    if (!venta.rows[0]) {
        return res.status(404).json({ error: 'Venta no encontrada' });
    }

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT vi.*, p.nombre AS producto_nombre, p.unidad_medida
         FROM venta_items vi
         JOIN productos p ON p.id = vi.producto_id
         WHERE vi.venta_id = $1`,
        [id]
    );

    const pagos = await consultaDeEmpresa(
        empresaId,
        `SELECT forma_pago, monto FROM venta_pagos WHERE venta_id = $1`,
        [id]
    );

    res.json({ ...venta.rows[0], items: items.rows, pagos: pagos.rows });
}

// Anula una venta: revierte el stock vendido y, si era fiado, el saldo que
// se le habia cargado al cliente. La fila nunca se borra, queda marcada
// para auditoria. Si quien la anula es cajero, hace falta el PIN de un
// dueno/encargado activo de la misma empresa (se prueba contra todos los
// que tengan PIN configurado, no hace falta indicar cual).
export async function anularVenta(req, res) {
    const { empresaId, usuarioId, rol } = req.usuario;
    const { id } = req.params;
    const { motivo, pin } = req.body;

    if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'Indicá el motivo de la anulación' });
    }

    try {
        const resultado = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const ventaResultado = await cliente.query(`SELECT * FROM ventas WHERE id = $1 FOR UPDATE`, [id]);
            const venta = ventaResultado.rows[0];
            if (!venta) {
                throw new ErrorNegocio('La venta no existe');
            }
            if (venta.anulada) {
                throw new ErrorNegocio('Esta venta ya está anulada');
            }
            // Si ya se le aplico algun cobro (fiado parcial o totalmente
            // pagado), anular a ciegas dejaria plata cobrada sin respaldo.
            // Hay que revertir esos cobros primero, esto no lo hace solo.
            if (venta.tipo_pago === 'credito' && Number(venta.saldo_pendiente) !== Number(venta.total)) {
                throw new ErrorNegocio('Esta venta ya tiene cobros aplicados — no se puede anular directamente');
            }

            let autorizadaPor = usuarioId;
            if (rol === 'cajero' && !(await tienePermiso(empresaId, usuarioId, 'anular_sin_pin'))) {
                if (!pin) {
                    throw new ErrorNegocio('Necesitás el PIN de un dueño o encargado para anular');
                }
                const supervisores = await cliente.query(
                    `SELECT id, pin_hash FROM usuarios
                     WHERE empresa_id = $1 AND rol IN ('dueno', 'encargado') AND activo = true AND pin_hash IS NOT NULL`,
                    [empresaId]
                );
                let coincidencia = null;
                for (const s of supervisores.rows) {
                    if (await bcrypt.compare(pin, s.pin_hash)) {
                        coincidencia = s.id;
                        break;
                    }
                }
                if (!coincidencia) {
                    throw new ErrorNegocio('PIN de autorización incorrecto');
                }
                autorizadaPor = coincidencia;
            }

            // Se devuelve el stock a la MISMA sucursal de la que salio (la
            // de la venta, no la sucursal actual de quien anula — pueden
            // no ser la misma persona ni el mismo lugar).
            const items = await cliente.query(
                `SELECT producto_id, cantidad FROM venta_items WHERE venta_id = $1`,
                [id]
            );
            for (const item of items.rows) {
                await cliente.query(
                    `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                     VALUES ($1, $2, $3, 0)
                     ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                    [empresaId, item.producto_id, venta.sucursal_id]
                );
                await cliente.query(
                    `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                    [item.producto_id, venta.sucursal_id]
                );
                await cliente.query(
                    `UPDATE producto_stock SET stock = stock + $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                    [item.producto_id, venta.sucursal_id, item.cantidad]
                );
            }

            if (venta.tipo_pago === 'credito') {
                await cliente.query(`UPDATE clientes SET saldo = saldo - $2 WHERE id = $1`, [
                    venta.cliente_id,
                    venta.total,
                ]);
            }

            await cliente.query(
                `UPDATE ventas
                 SET anulada = true, anulada_en = now(), anulada_por = $2, motivo_anulacion = $3, saldo_pendiente = 0
                 WHERE id = $1`,
                [id, autorizadaPor, motivo.trim()]
            );

            return { id, anuladaPor: autorizadaPor };
        });

        res.json(resultado);
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Reporte simple de ventas de un periodo: total vendido, cantidad de
// ventas, ticket promedio, top 5 productos por cantidad vendida, y
// desglose por forma de pago. Excluye ventas anuladas (no fueron ventas
// reales). Por defecto el periodo es "hoy" si no se manda desde/hasta.
export async function reporteVentas(req, res) {
    const { empresaId } = req.usuario;
    const hoy = new Date().toISOString().slice(0, 10);
    const desde = req.query.desde || hoy;
    const hasta = req.query.hasta || hoy;

    const totales = await consultaDeEmpresa(
        empresaId,
        `SELECT COUNT(*) AS cantidad_ventas, COALESCE(SUM(total), 0) AS total_vendido
         FROM ventas
         WHERE anulada = false AND creado_en >= $1::date AND creado_en < ($2::date + INTERVAL '1 day')`,
        [desde, hasta]
    );

    const topProductos = await consultaDeEmpresa(
        empresaId,
        `SELECT p.nombre, SUM(vi.cantidad) AS cantidad_vendida, SUM(vi.subtotal) AS total_vendido
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id
         JOIN productos p ON p.id = vi.producto_id
         WHERE v.anulada = false AND v.creado_en >= $1::date AND v.creado_en < ($2::date + INTERVAL '1 day')
         GROUP BY p.id, p.nombre
         ORDER BY cantidad_vendida DESC
         LIMIT 5`,
        [desde, hasta]
    );

    const porFormaPago = await consultaDeEmpresa(
        empresaId,
        `SELECT vp.forma_pago, SUM(vp.monto) AS total
         FROM venta_pagos vp
         JOIN ventas v ON v.id = vp.venta_id
         WHERE v.anulada = false AND v.creado_en >= $1::date AND v.creado_en < ($2::date + INTERVAL '1 day')
         GROUP BY vp.forma_pago`,
        [desde, hasta]
    );

    const cantidadVentas = Number(totales.rows[0].cantidad_ventas);
    const totalVendido = Number(totales.rows[0].total_vendido);

    res.json({
        desde,
        hasta,
        cantidadVentas,
        totalVendido,
        ticketPromedio: cantidadVentas > 0 ? totalVendido / cantidadVentas : 0,
        topProductos: topProductos.rows,
        porFormaPago: porFormaPago.rows,
    });
}
