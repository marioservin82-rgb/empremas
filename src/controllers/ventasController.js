import bcrypt from 'bcrypt';
import { transaccionDeEmpresa, consultaDeEmpresa } from '../config/db.js';
import { ErrorNegocio } from '../utils/errorNegocio.js';
import { turnoAbiertoDe } from './turnosController.js';
import { tienePermiso } from '../utils/permisos.js';
import { emitirFacturaElectronica, descargarKude, ErrorSifen } from '../services/sifenService.js';
import {
    emitirFactura as emitirFacturaConector,
    descargarKude as descargarKudeConector,
    consultarDocumento as consultarDocumentoConector,
    cancelarDocumento as cancelarDocumentoConector,
    mapearVentaAConector,
    resolverReceptor as resolverReceptorConector,
    ErrorConector,
} from '../services/conectorSifen.js';
import { categoriaYVolumenDeCliente } from './clientesController.js';

// Deriva "EST-PUN-NNNNNNN" del CDC de SIFEN
// (44 díg.: iTiDE[2] RUC[8] DV[1] est[3] pun[3] num[7] ...).
function numeroDesdeCdc(cdc) {
    if (!cdc || cdc.length < 24) return null;
    return `${cdc.slice(11, 14)}-${cdc.slice(14, 17)}-${cdc.slice(17, 24)}`;
}

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

// Deriva el número de 7 díg. para el conector desde el número formateado
// ("001-001-0000322" -> "0000322") o el CDC.
function numeroReintentoDe(numeroFormateado, cdc) {
    if (numeroFormateado && numeroFormateado.includes('-')) return numeroFormateado.split('-')[2];
    if (cdc && cdc.length >= 24) return cdc.slice(17, 24);
    return null;
}

// Registra (o actualiza) un intento de emisión en el log. `codigo` se saca del
// mensaje si viene con el formato "2377 - ...".
async function registrarIntento(empresaId, deId, intento, estado, cdc, mensaje) {
    const codigo = mensaje ? (mensaje.match(/^(\d{3,4})\s*-\s*/) || [])[1] || null : null;
    await consultaDeEmpresa(
        empresaId,
        `INSERT INTO documento_electronico_intentos (empresa_id, documento_id, intento, estado, cdc, codigo, mensaje)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (documento_id, intento)
           DO UPDATE SET estado = EXCLUDED.estado, cdc = EXCLUDED.cdc, codigo = EXCLUDED.codigo,
                         mensaje = EXCLUDED.mensaje, actualizado_en = now()`,
        [empresaId, deId, intento, estado, cdc, codigo, mensaje]
    );
}

// Actualiza el documento electronico de una venta con el resultado de la
// emision - se llama FUERA de la transaccion de la venta a proposito: un
// problema de SIFEN no debe hacer perder la venta ya registrada, solo deja
// el DE en 'error' para reintentar.
//
// `via`: 'conector' (EMPREMAS-SIFEN propio, empresas en produccion) o
// 'sifende' (proveedor tercero, camino legacy).
// `numeroReintento`: si viene, el conector reemite con ESE número (factura
// rechazada que se reprocesa manteniendo su número original).
async function emitirYActualizarDe({
    empresaId, deId, via, conectorTenantId, apiKey, establecimiento, puntoExpedicion, venta, items, cliente,
    numeroReintento = null,
}) {
    // Número del intento actual (para el log). El DE ya existe siempre acá.
    const intentoRes = await consultaDeEmpresa(
        empresaId,
        `SELECT intento FROM documentos_electronicos WHERE id = $1`,
        [deId]
    );
    const intento = intentoRes.rows[0]?.intento || 1;

    try {
        let estado;
        let cdc;
        let numeroFormateado;
        let totales = null;

        if (via === 'conector') {
            // Se clasifica al receptor contra el padrón de SIFEN: sin esto una
            // cédula escrita con verificador ("4659459-0") se manda como RUC y
            // SIFEN rechaza el DE.
            const receptor = await resolverReceptorConector({ cliente, tenantId: conectorTenantId });
            const payload = mapearVentaAConector({ venta, items, cliente, receptor });
            const r = await emitirFacturaConector(conectorTenantId, payload, numeroReintento);
            estado = (r.estado || 'enviado').toLowerCase();
            cdc = r.cdc;
            numeroFormateado = numeroDesdeCdc(r.cdc);
            totales = r.totales || null;
            if (Array.isArray(r.errores) && r.errores.length && estado !== 'aprobado') {
                const motivo = r.errores.join('; ');
                await consultaDeEmpresa(
                    empresaId,
                    `UPDATE documentos_electronicos SET estado = $2, cdc = $3, numero_formateado = $4, mensaje_error = $5,
                        gravado_5 = $6, gravado_10 = $7, exentas = $8, iva_5 = $9, iva_10 = $10, total_iva = $11,
                        actualizado_en = now() WHERE id = $1`,
                    [deId, estado || 'rechazado', cdc, numeroFormateado, motivo,
                     totales?.gravado5 ?? null, totales?.gravado10 ?? null, totales?.exentas ?? null,
                     totales?.iva5 ?? null, totales?.iva10 ?? null, totales?.totalIva ?? null]
                );
                await registrarIntento(empresaId, deId, intento, estado || 'rechazado', cdc, motivo);
                return;
            }
        } else {
            const r = await emitirFacturaElectronica({ apiKey, establecimiento, puntoExpedicion, venta, items, cliente });
            estado = r.estado?.toLowerCase() || 'enviado';
            cdc = r.cdc;
            numeroFormateado = r.numeroFormateado;
        }

        await consultaDeEmpresa(
            empresaId,
            `UPDATE documentos_electronicos SET estado = $2, cdc = $3, numero_formateado = $4, mensaje_error = NULL,
                gravado_5 = COALESCE($5, gravado_5), gravado_10 = COALESCE($6, gravado_10), exentas = COALESCE($7, exentas),
                iva_5 = COALESCE($8, iva_5), iva_10 = COALESCE($9, iva_10), total_iva = COALESCE($10, total_iva),
                actualizado_en = now() WHERE id = $1`,
            [deId, estado, cdc, numeroFormateado,
             totales?.gravado5 ?? null, totales?.gravado10 ?? null, totales?.exentas ?? null,
             totales?.iva5 ?? null, totales?.iva10 ?? null, totales?.totalIva ?? null]
        );
        await registrarIntento(empresaId, deId, intento, estado, cdc, null);
    } catch (error) {
        const mensaje =
            error instanceof ErrorSifen || error instanceof ErrorConector
                ? error.message
                : 'No se pudo conectar con SIFEN';
        await consultaDeEmpresa(
            empresaId,
            `UPDATE documentos_electronicos SET estado = 'error', mensaje_error = $2, actualizado_en = now() WHERE id = $1`,
            [deId, mensaje]
        );
        await registrarIntento(empresaId, deId, intento, 'error', null, mensaje);
    }
}

// Valida los pagos de una venta que no es fiado y calcula el vuelto.
// Permite pagos hibridos (ej. mitad efectivo, mitad tarjeta): solo el
// efectivo puede generar vuelto, porque no tiene sentido "dar vuelto" en
// tarjeta o transferencia.
export function calcularVuelto(pagos, total) {
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
    const { clienteId, tipoPago, pagos, items, tipoComprobante, presupuestoId, vendedorId, remisionId } = req.body;
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
                `SELECT permitir_venta_sin_stock, plazo_credito_dias, sifen_api_key, sifen_establecimiento,
                        sifen_estado, sifen_conector_tenant_id, comisiones_habilitadas
                 FROM empresas WHERE id = $1`,
                [empresaId]
            );
            const permitirVentaSinStock = empresaResultado.rows[0]?.permitir_venta_sin_stock ?? false;
            const plazoCreditoDias = empresaResultado.rows[0]?.plazo_credito_dias ?? 30;
            const sifenApiKey = empresaResultado.rows[0]?.sifen_api_key;
            const sifenEstablecimiento = empresaResultado.rows[0]?.sifen_establecimiento;
            const sifenEstado = empresaResultado.rows[0]?.sifen_estado;
            const conectorTenantId = empresaResultado.rows[0]?.sifen_conector_tenant_id;
            const comisionesHabilitadas = empresaResultado.rows[0]?.comisiones_habilitadas ?? false;

            // Empresa en producción con el conector propio -> emite por ahí.
            // Si no, cae al camino legacy de Sifende (api key).
            const facturaPorConector = sifenEstado === 'produccion' && !!conectorTenantId;

            if (comprobante === 'factura_legal' && !facturaPorConector && !sifenApiKey) {
                throw new ErrorNegocio(
                    'Factura Legal todavía no está disponible: falta habilitar la facturación electrónica de esta empresa'
                );
            }

            // Si esta venta factura una Nota de Remisión ya emitida: la
            // mercadería ya salió del depósito (la remisión descontó el stock),
            // así que acá NO se vuelve a descontar, y la factura se asocia a la
            // remisión por su CDC.
            let remision = null;
            if (remisionId) {
                const rr = await cliente.query(
                    `SELECT id, cdc, estado, facturada, descuenta_stock FROM remisiones WHERE id = $1`,
                    [remisionId]
                );
                remision = rr.rows[0];
                if (!remision) throw new ErrorNegocio('La remisión no existe');
                if (remision.facturada) throw new ErrorNegocio('Esta remisión ya fue facturada');
            }
            const saltarStock = !!(remision && remision.descuenta_stock);

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

            // Vendedor por comision (modulo opcional): prioridad al vendedor
            // asignado al cliente (protege su comision aunque el cliente
            // compre sin pasar por el) - un vendedorId mandado por el cajero
            // nunca lo pisa. Si el cliente no tiene uno asignado, se usa el
            // que eligio el cajero (opcional). Resuelto ANTES del loop de
            // items, mismo motivo que beneficios: la comision de cada linea
            // depende de esto.
            let vendedorIdFinal = null;
            let datosVendedor = null;
            let mapaComisionFija = new Map();
            if (comisionesHabilitadas) {
                const clienteFila = await cliente.query(`SELECT vendedor_id FROM clientes WHERE id = $1`, [clienteIdFinal]);
                vendedorIdFinal = clienteFila.rows[0]?.vendedor_id || vendedorId || null;
                if (vendedorIdFinal) {
                    const vendedorFila = await cliente.query(
                        `SELECT tipo_comision, valor_comision FROM vendedores WHERE id = $1 AND activo = true`,
                        [vendedorIdFinal]
                    );
                    datosVendedor = vendedorFila.rows[0] || null;
                    if (!datosVendedor) vendedorIdFinal = null; // vendedor invalido/inactivo, sin comision
                }
                if (vendedorIdFinal) {
                    const fijos = await cliente.query(
                        `SELECT producto_id, monto FROM productos_comision_fija WHERE empresa_id = $1`,
                        [empresaId]
                    );
                    mapaComisionFija = new Map(fijos.rows.map((f) => [f.producto_id, Number(f.monto)]));
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
                    `SELECT nombre, tasa_iva, precio_costo, es_compuesto, ${columnaPrecio} AS precio, precio_mayorista FROM productos WHERE id = $1`,
                    [productoId]
                );
                const producto = productoResultado.rows[0];
                if (!producto) {
                    throw new ErrorNegocio('Uno de los productos ya no existe');
                }

                // Producto compuesto (ej. Sandwich): nunca tiene stock
                // propio, se arma al vender - en vez de chequear/bloquear
                // su propia fila de producto_stock, se chequea cada
                // ingrediente de su receta (multiplicado por la cantidad
                // vendida) y se guarda la lista para descontarla mas abajo,
                // despues de insertar la venta (ver segundo loop).
                let consumosInsumo = null;
                if (producto.es_compuesto) {
                    const recetaResultado = await cliente.query(
                        `SELECT insumo_id, cantidad FROM producto_receta_items WHERE producto_id = $1`,
                        [productoId]
                    );
                    consumosInsumo = [];
                    for (const recetaItem of recetaResultado.rows) {
                        const cantidadNecesaria = Number(recetaItem.cantidad) * cantidad;
                        await cliente.query(
                            `INSERT INTO producto_stock (empresa_id, producto_id, sucursal_id, stock)
                             VALUES ($1, $2, $3, 0)
                             ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
                            [empresaId, recetaItem.insumo_id, sucursalId]
                        );
                        const stockInsumoResultado = await cliente.query(
                            `SELECT stock FROM producto_stock WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
                            [recetaItem.insumo_id, sucursalId]
                        );
                        const stockInsumoActual = Number(stockInsumoResultado.rows[0].stock);
                        if (!permitirVentaSinStock && stockInsumoActual < cantidadNecesaria) {
                            throw new ErrorNegocio(
                                `No hay suficiente stock de un ingrediente de "${producto.nombre}"`
                            );
                        }
                        consumosInsumo.push({ insumoId: recetaItem.insumo_id, cantidad: cantidadNecesaria });
                    }
                } else {
                    // Si esta sucursal todavia no tiene fila de stock para
                    // este producto (ej. nunca se vendio ahi), la crea en 0
                    // antes de bloquearla.
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

                // Comision congelada de esta linea (ver venta_items.comision_monto):
                // producto con comision fija a nivel empresa pisa el tipo de
                // comision del vendedor, sin importar cual sea.
                let comisionMonto = 0;
                if (vendedorIdFinal) {
                    const fija = mapaComisionFija.get(productoId);
                    comisionMonto =
                        fija != null
                            ? fija * cantidad
                            : datosVendedor.tipo_comision === 'porcentaje'
                            ? subtotal * (Number(datosVendedor.valor_comision) / 100)
                            : Number(datosVendedor.valor_comision) * cantidad;
                }

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
                    comisionMonto,
                    subtotal,
                    nombre: producto.nombre,
                    tasa_iva: producto.tasa_iva,
                    consumosInsumo,
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
                `INSERT INTO ventas (empresa_id, cliente_id, usuario_id, turno_id, sucursal_id, numero_ticket, tipo_pago, vuelto, total, vencimiento, saldo_pendiente, tipo_comprobante, presupuesto_id, vendedor_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
                    vendedorIdFinal,
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
                    `INSERT INTO venta_items (empresa_id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, es_mayorista, comision_monto)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        empresaId,
                        ventaId,
                        item.productoId,
                        item.cantidad,
                        item.precioUnitario,
                        item.subtotal,
                        item.costoUnitario,
                        item.esMayorista,
                        item.comisionMonto,
                    ]
                );
                // Producto compuesto: nunca se toca su propio stock (no
                // tiene) - se descuenta cada ingrediente de su receta en su
                // lugar, ya multiplicado por la cantidad vendida (ver
                // consumosInsumo, calculado en el primer loop).
                if (saltarStock) {
                    // La remisión ya descontó el stock al salir del depósito.
                } else if (item.consumosInsumo) {
                    for (const consumo of item.consumosInsumo) {
                        await cliente.query(
                            `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                            [consumo.insumoId, sucursalId, consumo.cantidad]
                        );
                    }
                } else {
                    await cliente.query(
                        `UPDATE producto_stock SET stock = stock - $3 WHERE producto_id = $1 AND sucursal_id = $2`,
                        [item.productoId, sucursalId, item.cantidad]
                    );
                }
            }

            if (remision) {
                await cliente.query(
                    `UPDATE remisiones SET venta_id = $2, facturada = true, actualizado_en = now() WHERE id = $1`,
                    [remision.id, ventaId]
                );
            }

            if (comprobante === 'factura_legal') {
                const deInsertado = await cliente.query(
                    `INSERT INTO documentos_electronicos (empresa_id, venta_id) VALUES ($1, $2) RETURNING id`,
                    [empresaId, ventaId]
                );
                const clienteResultado = await cliente.query(
                    `SELECT nombre, documento, es_generico, clasificacion_sifen FROM clientes WHERE id = $1`,
                    [clienteIdFinal]
                );
                const sucursalResultado = await cliente.query(
                    `SELECT punto_expedicion FROM sucursales WHERE id = $1`,
                    [sucursalId]
                );
                // Se guarda para emitir DESPUES de que esta transaccion
                // confirme - un problema de SIFEN no debe hacer fallar/perder
                // la venta ya registrada.
                deParaEmitir = {
                    deId: deInsertado.rows[0].id,
                    via: facturaPorConector ? 'conector' : 'sifende',
                    conectorTenantId,
                    apiKey: sifenApiKey,
                    establecimiento: sifenEstablecimiento,
                    puntoExpedicion: sucursalResultado.rows[0]?.punto_expedicion || 1,
                    venta: {
                        tipoPago,
                        pagos: pagos || [],
                        vencimiento,
                        plazoCreditoDias,
                        cdcRemisionAsociada: remision?.cdc || undefined,
                    },
                    items: itemsCalculados,
                    cliente: clienteResultado.rows[0],
                    remisionId: remision?.id || null,
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
            // Se espera SÓLO hasta tener el CDC (envío aceptado por SIFEN): ~6-8s.
            // La APROBACIÓN final (asíncrona, por lote) la resuelve el barredor de
            // fondo — la caja no espera eso. Si falla, el DE queda 'error'/'enviado'
            // y el barredor lo reintenta.
            await emitirYActualizarDe({ empresaId, ...deParaEmitir }).catch((e) =>
                console.error('[SIFEN] emisión falló:', e?.message)
            );

            // Deja el CDC de la factura en la remisión (para el detalle de la remisión).
            if (deParaEmitir.remisionId) {
                await consultaDeEmpresa(
                    empresaId,
                    `UPDATE remisiones r SET factura_cdc = de.cdc, actualizado_en = now()
                       FROM documentos_electronicos de
                      WHERE de.id = $2 AND r.id = $1 AND de.cdc IS NOT NULL`,
                    [deParaEmitir.remisionId, deParaEmitir.deId]
                ).catch(() => {});
            }
        }

        res.status(201).json({ ...venta, tieneDocumentoElectronico: !!deParaEmitir });
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Resuelve el documento electrónico de una venta según su estado actual:
//  - 'enviado' vía conector (lote en trámite) -> re-consulta por CDC.
//  - 'error' / 'pendiente' / 'rechazado'      -> re-emite (rechazado mantiene
//    su MISMO número; error/pendiente reusan el número ya asignado).
// Cada emisión queda en el log documento_electronico_intentos.
// Lo usa el botón "reintentar" y el barredor de fondo (barrerDocumentosElectronicos).
export async function resolverDocumentoDeVenta(empresaId, ventaId) {
    // --- Sección crítica: se lee y se "reclama" el DE bajo lock de fila, para
    // que dos llamadas concurrentes (doble click en "reintentar" + el barredor)
    // no lo emitan dos veces y hagan saltar el número. ---
    const plan = await transaccionDeEmpresa(empresaId, async (db) => {
        const { rows } = await db.query(
            `SELECT de.id AS de_id, de.estado AS de_estado, de.cdc AS de_cdc, de.intento AS de_intento,
                    de.numero_formateado AS de_numero_formateado, de.actualizado_en AS de_actualizado_en,
                    v.tipo_pago, v.vencimiento,
                    e.sifen_api_key, e.sifen_establecimiento, e.sifen_estado, e.sifen_conector_tenant_id,
                    e.plazo_credito_dias,
                    s.punto_expedicion,
                    c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.es_generico AS cliente_es_generico,
                    c.clasificacion_sifen AS cliente_clasificacion_sifen
             FROM documentos_electronicos de
             JOIN ventas v ON v.id = de.venta_id
             JOIN empresas e ON e.id = v.empresa_id
             LEFT JOIN sucursales s ON s.id = v.sucursal_id
             LEFT JOIN clientes c ON c.id = v.cliente_id
             WHERE de.venta_id = $1
             FOR UPDATE OF de`,
            [ventaId]
        );
        const fila = rows[0];
        if (!fila) throw new ErrorNegocio('Esta venta no tiene un documento electrónico asociado');
        const viaConector = fila.sifen_estado === 'produccion' && !!fila.sifen_conector_tenant_id;

        if (fila.de_estado === 'aprobado') return { accion: 'nada', estado: 'aprobado' };

        // 'pendiente' tocado hace menos de 3 min: hay una emisión en curso (otro
        // click o el barredor). No se re-emite: evita duplicar y que salte el número.
        const recienTocado = Date.now() - new Date(fila.de_actualizado_en).getTime() < 3 * 60 * 1000;
        if (fila.de_estado === 'pendiente' && recienTocado) {
            return { accion: 'nada', estado: 'pendiente' };
        }

        if (fila.de_cdc && viaConector && fila.de_estado === 'enviado') {
            return { accion: 'reconsultar', fila };
        }

        if (!['error', 'pendiente', 'enviado', 'rechazado'].includes(fila.de_estado)) {
            return { accion: 'nada', estado: fila.de_estado };
        }
        if (!viaConector && !fila.sifen_api_key) throw new ErrorNegocio('SIFEN ya no está configurado para esta empresa');

        // Reclamo: se marca 'pendiente' (con actualizado_en fresco) para que nadie
        // más lo tome. Si venía rechazado se abre un intento nuevo — el número NO
        // cambia (el conector reemite con numeroReintento).
        let numeroReintento = null;
        if (fila.de_estado === 'rechazado') {
            await db.query(
                `UPDATE documentos_electronicos
                    SET intento = intento + 1, estado = 'pendiente', mensaje_error = NULL, actualizado_en = now()
                  WHERE id = $1`,
                [fila.de_id]
            );
            numeroReintento = numeroReintentoDe(fila.de_numero_formateado, fila.de_cdc);
        } else {
            await db.query(
                `UPDATE documentos_electronicos SET estado = 'pendiente', actualizado_en = now() WHERE id = $1`,
                [fila.de_id]
            );
        }
        return { accion: 'emitir', fila, viaConector, numeroReintento };
    });

    if (plan.accion === 'nada') return plan.estado;

    if (plan.accion === 'reconsultar') {
        const { fila } = plan;
        const r = await consultarDocumentoConector(fila.de_cdc);
        const nuevoEstado = (r.estado || 'enviado').toLowerCase();
        const motivo = Array.isArray(r.errores) && r.errores.length ? r.errores.join('; ') : null;
        await consultaDeEmpresa(
            empresaId,
            `UPDATE documentos_electronicos SET estado = $2, mensaje_error = $3, actualizado_en = now() WHERE id = $1`,
            [fila.de_id, nuevoEstado, nuevoEstado === 'rechazado' ? motivo : null]
        );
        await registrarIntento(empresaId, fila.de_id, fila.de_intento || 1, nuevoEstado, fila.de_cdc, motivo);
        return nuevoEstado;
    }

    // plan.accion === 'emitir'
    const { fila, viaConector, numeroReintento } = plan;
    const deIdParaEmitir = fila.de_id;

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT vi.producto_id, vi.cantidad, vi.precio_unitario AS "precioUnitario", p.nombre, p.tasa_iva
         FROM venta_items vi JOIN productos p ON p.id = vi.producto_id WHERE vi.venta_id = $1`,
        [ventaId]
    );
    const pagos = await consultaDeEmpresa(
        empresaId,
        `SELECT forma_pago AS "formaPago", monto FROM venta_pagos WHERE venta_id = $1`,
        [ventaId]
    );

    await emitirYActualizarDe({
        via: viaConector ? 'conector' : 'sifende',
        conectorTenantId: fila.sifen_conector_tenant_id,
        empresaId,
        deId: deIdParaEmitir,
        numeroReintento,
        apiKey: fila.sifen_api_key,
        establecimiento: fila.sifen_establecimiento,
        puntoExpedicion: fila.punto_expedicion || 1,
        venta: {
            tipoPago: fila.tipo_pago,
            pagos: pagos.rows,
            vencimiento: fila.vencimiento,
            plazoCreditoDias: fila.plazo_credito_dias,
        },
        items: items.rows,
        cliente: {
            nombre: fila.cliente_nombre,
            documento: fila.cliente_documento,
            es_generico: fila.cliente_es_generico,
            clasificacion_sifen: fila.cliente_clasificacion_sifen,
        },
    });

    const act = await consultaDeEmpresa(
        empresaId,
        `SELECT estado FROM documentos_electronicos WHERE id = $1`,
        [deIdParaEmitir]
    );
    return act.rows[0]?.estado;
}

// Reintenta / re-consulta el documento electrónico de una venta (botón manual).
export async function reintentarSifen(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    try {
        await resolverDocumentoDeVenta(empresaId, id);
    } catch (error) {
        if (error instanceof ErrorNegocio) return res.status(400).json({ error: error.message });
        return res.status(422).json({ error: error.message });
    }
    const actualizado = await consultaDeEmpresa(
        empresaId,
        `SELECT de.estado, de.cdc, de.numero_formateado, de.mensaje_error
         FROM documentos_electronicos de WHERE de.venta_id = $1`,
        [id]
    );
    res.json(actualizado.rows[0]);
}

// Convierte una venta ya emitida como ticket comun/A4/sin comprobante en
// Factura Legal (SIFEN) - sin tocar stock ni caja: la venta ya quedo
// registrada en su momento (venta_items, producto_stock, venta_pagos,
// clientes.saldo si era credito), esto solo le agrega el documento
// electronico que le faltaba.
//
// A proposito NO pasa por resolverDocumentoDeVenta para la emision: esa
// funcion tiene una guarda anti-doble-emision ("si el DE esta 'pendiente'
// y se toco hace menos de 3 min, asumir que YA hay una emision en curso y
// no hacer nada") pensada para el boton "Reintentar"/el barredor de fondo,
// donde 'pendiente' reciente significa "otro proceso ya lo esta
// procesando". Aca el DE recien se creo, en 'pendiente' porque todavia NO
// se intento nunca - con esa guarda, la emision real jamas se dispara y el
// documento queda pegado hasta que alguien entre a mano a /ventas/:id y
// aprete Reintentar. Se llama emitirYActualizarDe directo, mismo camino
// que ya usa crearVenta para una Factura Legal nueva.
//
// Aviso importante (no es un bug, es una limitacion real de SIFEN/del
// conector): la factura sale con fecha de EMISION de hoy, nunca la fecha
// original de la venta - mismo comportamiento que cualquier Factura Legal
// ya tiene hoy (sifenService.js/conectorSifen.js siempre mandan "ahora").
export async function convertirAFacturaLegal(req, res) {
    const { empresaId } = req.usuario;
    const { id: ventaId } = req.params;

    const empresaResultado = await consultaDeEmpresa(
        empresaId,
        `SELECT sifen_api_key, sifen_estado, sifen_conector_tenant_id, sifen_establecimiento, plazo_credito_dias
         FROM empresas WHERE id = $1`,
        [empresaId]
    );
    const empresaFila = empresaResultado.rows[0];
    const facturaPorConector = empresaFila?.sifen_estado === 'produccion' && !!empresaFila?.sifen_conector_tenant_id;
    if (!facturaPorConector && !empresaFila?.sifen_api_key) {
        return res
            .status(400)
            .json({ error: 'Factura Legal todavía no está disponible: falta habilitar la facturación electrónica de esta empresa' });
    }

    let deParaEmitir;
    try {
        deParaEmitir = await transaccionDeEmpresa(empresaId, async (cliente) => {
            const ventaResultado = await cliente.query(
                `SELECT tipo_pago, vencimiento, sucursal_id, tipo_comprobante, anulada FROM ventas WHERE id = $1 FOR UPDATE`,
                [ventaId]
            );
            const venta = ventaResultado.rows[0];
            if (!venta) throw new ErrorNegocio('La venta no existe');
            if (venta.anulada) throw new ErrorNegocio('Esta venta está anulada — no se puede convertir');
            if (venta.tipo_comprobante === 'factura_legal') {
                throw new ErrorNegocio('Esta venta ya es una Factura Legal');
            }

            const deExistente = await cliente.query(`SELECT id FROM documentos_electronicos WHERE venta_id = $1`, [
                ventaId,
            ]);
            if (deExistente.rows.length > 0) {
                throw new ErrorNegocio('Esta venta ya tiene un documento electrónico asociado');
            }

            await cliente.query(`UPDATE ventas SET tipo_comprobante = 'factura_legal' WHERE id = $1`, [ventaId]);
            const deInsertado = await cliente.query(
                `INSERT INTO documentos_electronicos (empresa_id, venta_id) VALUES ($1, $2) RETURNING id`,
                [empresaId, ventaId]
            );

            const itemsResultado = await cliente.query(
                `SELECT vi.producto_id, vi.cantidad, vi.precio_unitario AS "precioUnitario", p.nombre, p.tasa_iva
                 FROM venta_items vi JOIN productos p ON p.id = vi.producto_id WHERE vi.venta_id = $1`,
                [ventaId]
            );
            const pagosResultado = await cliente.query(
                `SELECT forma_pago AS "formaPago", monto FROM venta_pagos WHERE venta_id = $1`,
                [ventaId]
            );
            const clienteResultado = await cliente.query(
                `SELECT nombre, documento, es_generico, clasificacion_sifen FROM clientes WHERE id =
                    (SELECT cliente_id FROM ventas WHERE id = $1)`,
                [ventaId]
            );
            const sucursalResultado = await cliente.query(`SELECT punto_expedicion FROM sucursales WHERE id = $1`, [
                venta.sucursal_id,
            ]);

            return {
                deId: deInsertado.rows[0].id,
                via: facturaPorConector ? 'conector' : 'sifende',
                conectorTenantId: empresaFila.sifen_conector_tenant_id,
                apiKey: empresaFila.sifen_api_key,
                establecimiento: empresaFila.sifen_establecimiento,
                puntoExpedicion: sucursalResultado.rows[0]?.punto_expedicion || 1,
                venta: {
                    tipoPago: venta.tipo_pago,
                    pagos: pagosResultado.rows,
                    vencimiento: venta.vencimiento,
                    plazoCreditoDias: empresaFila.plazo_credito_dias,
                },
                items: itemsResultado.rows,
                cliente: clienteResultado.rows[0] || { nombre: 'Consumidor Final', es_generico: true },
            };
        });
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }

    // Emision real, FUERA de la transaccion de arriba (mismo criterio que
    // crearVenta): si SIFEN falla o tarda, la conversion ya quedo
    // registrada (tipo_comprobante='factura_legal' + DE en 'error') - se
    // reintenta con el mismo boton "Reintentar" que ya existe en
    // /ventas/:id (ese SI pasa por resolverDocumentoDeVenta, correcto para
    // un DE que ya tuvo un primer intento), sin perder nada.
    await emitirYActualizarDe({ empresaId, ...deParaEmitir }).catch((e) =>
        console.error('[SIFEN] conversión a factura legal falló:', e?.message)
    );

    const actualizado = await consultaDeEmpresa(
        empresaId,
        `SELECT de.estado, de.cdc, de.numero_formateado, de.mensaje_error
         FROM documentos_electronicos de WHERE de.venta_id = $1`,
        [ventaId]
    );
    res.json({ ventaId, ...actualizado.rows[0] });
}

// Descarga el KuDE (PDF con QR) de la Factura Legal de una venta, solo
// disponible una vez que SIFEN la aprobo. El PDF en si no se guarda en
// EMPREMAS - se pide a Sifende al vuelo cada vez.
export async function descargarKudeVenta(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const datos = await consultaDeEmpresa(
        empresaId,
        `SELECT de.estado, de.cdc, e.sifen_api_key, e.sifen_estado, e.sifen_conector_tenant_id
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

    const viaConector = fila.sifen_estado === 'produccion' && !!fila.sifen_conector_tenant_id;
    const pdf = viaConector
        ? await descargarKudeConector(fila.cdc)
        : await descargarKude({ apiKey: fila.sifen_api_key, cdc: fila.cdc });
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
        `SELECT v.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.es_generico AS cliente_es_generico
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
        `SELECT v.id, v.numero_ticket, v.tipo_pago, v.total, v.vuelto, v.creado_en,
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

    // Desglose del Contado por forma de pago (Efectivo/Transferencia/T.
    // Crédito/T. Débito) - pensado para que el dueño, sin estar en el
    // local, entienda cuánto de lo vendido al contado le entró en cada
    // forma. Suma exacto a totalContado: solo se cuentan pagos de ventas
    // no-crédito (la entrega inicial de una venta a crédito es un abono a
    // cuenta, un concepto distinto, no encaja acá), y el efectivo se
    // descuenta el vuelto entregado - mismo criterio ya usado en
    // efectivoEsperadoDeTurno (turnosController.js) para no contar de más
    // lo que un cliente pagó de más en efectivo y se llevó de vuelto.
    const ventaIdsContado = new Set(ventas.rows.filter((v) => v.tipo_pago !== 'credito').map((v) => v.id));
    const totalPorFormaPago = { efectivo: 0, transferencia: 0, tarjeta_credito: 0, tarjeta_debito: 0 };
    for (const p of pagos.rows) {
        if (!ventaIdsContado.has(p.venta_id)) continue;
        if (totalPorFormaPago[p.forma_pago] !== undefined) {
            totalPorFormaPago[p.forma_pago] += Number(p.monto);
        }
    }
    const totalVueltoContado = ventas.rows
        .filter((v) => ventaIdsContado.has(v.id))
        .reduce((acumulado, v) => acumulado + Number(v.vuelto || 0), 0);
    totalPorFormaPago.efectivo -= totalVueltoContado;

    res.json({
        fecha,
        puedeVerTodo,
        totalVendido,
        totalContado,
        totalPorFormaPago,
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
                de.id AS de_id, de.estado AS de_estado, de.cdc AS de_cdc,
                de.numero_formateado AS de_numero_formateado, de.mensaje_error AS de_mensaje_error,
                de.intento AS de_intento,
                -- cuántos intentos previos terminaron rechazados/error (para mostrar "reprocesada")
                (SELECT count(*) FROM documento_electronico_intentos i
                  WHERE i.documento_id = de.id AND i.intento < de.intento
                    AND i.estado IN ('rechazado', 'error')) AS de_rechazos_previos
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN documentos_electronicos de ON de.venta_id = v.id
         WHERE ${condiciones.join(' AND ')}
         ORDER BY v.creado_en DESC LIMIT 300`,
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
                c.direccion AS cliente_direccion, c.es_generico AS cliente_es_generico,
                u.nombre AS anulada_por_nombre,
                de.id AS de_id, de.estado AS de_estado, de.cdc AS de_cdc, de.numero_formateado AS de_numero_formateado,
                de.mensaje_error AS de_mensaje_error, de.intento AS de_intento,
                de.cancelado_en_sifen AS de_cancelado_en_sifen, de.cancelacion_mensaje AS de_cancelacion_mensaje,
                de.gravado_5, de.gravado_10, de.exentas AS de_exentas,
                de.iva_5, de.iva_10, de.total_iva
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

    // Historial de intentos de emisión del documento electrónico (si tiene).
    let intentos = [];
    if (venta.rows[0].de_id) {
        const intentosRes = await consultaDeEmpresa(
            empresaId,
            `SELECT intento, estado, cdc, codigo, mensaje, creado_en, actualizado_en
             FROM documento_electronico_intentos WHERE documento_id = $1 ORDER BY intento`,
            [venta.rows[0].de_id]
        );
        intentos = intentosRes.rows;
    }

    const items = await consultaDeEmpresa(
        empresaId,
        `SELECT vi.*, p.nombre AS producto_nombre, p.unidad_medida, p.tasa_iva
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

    const f = venta.rows[0];
    // Desglose de IVA que quedó en el XML/KuDE (para el ticket). Si el conector
    // todavía no lo devolvió (o es camino Sifende), queda en null y el ticket
    // simplemente no lo muestra.
    const desgloseIva =
        f.total_iva != null || f.gravado_5 != null || f.gravado_10 != null
            ? {
                  gravado5: Number(f.gravado_5 || 0),
                  gravado10: Number(f.gravado_10 || 0),
                  exentas: Number(f.de_exentas || 0),
                  iva5: Number(f.iva_5 || 0),
                  iva10: Number(f.iva_10 || 0),
                  totalIva: Number(f.total_iva || 0),
              }
            : null;

    res.json({ ...f, items: items.rows, pagos: pagos.rows, intentos, desglose_iva: desgloseIva });
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

        // Si la venta tenía Factura Legal aprobada, se comunica la anulación a
        // SIFEN (evento de cancelación). Va DESPUÉS de la transacción: si SIFEN
        // no acepta (p. ej. pasaron las 48h), la anulación local igual queda
        // hecha y el resultado se guarda para reintentar desde el detalle.
        const cancelacionSifen = await cancelarFacturaEnSifen(empresaId, id, motivo.trim());

        res.json({ ...resultado, cancelacionSifen });
    } catch (error) {
        if (error instanceof ErrorNegocio) {
            return res.status(400).json({ error: error.message });
        }
        throw error;
    }
}

// Comunica a SIFEN la cancelación de la Factura Legal de una venta (evento de
// cancelación). No lanza: devuelve { aplicable, ok, mensaje }.
async function cancelarFacturaEnSifen(empresaId, ventaId, motivo) {
    const r = await consultaDeEmpresa(
        empresaId,
        `SELECT de.id AS de_id, de.cdc, de.estado, de.cancelado_en_sifen,
                e.sifen_estado, e.sifen_conector_tenant_id
         FROM documentos_electronicos de
         JOIN empresas e ON e.id = de.empresa_id
         WHERE de.venta_id = $1 AND de.tipo = 'factura_electronica'`,
        [ventaId]
    );
    const de = r.rows[0];
    const viaConector = de && de.sifen_estado === 'produccion' && !!de.sifen_conector_tenant_id;
    if (!de || !viaConector || de.estado !== 'aprobado' || !de.cdc) {
        return { aplicable: false };
    }
    if (de.cancelado_en_sifen) {
        return { aplicable: true, ok: true, mensaje: 'Ya estaba cancelada en SIFEN' };
    }

    // El motivo de SIFEN debe tener 5-500 caracteres.
    const motivoSifen = (motivo && motivo.length >= 5 ? motivo : `Anulación: ${motivo || 'operación no concretada'}`).slice(0, 500);

    try {
        await cancelarDocumentoConector(de.sifen_conector_tenant_id, de.cdc, motivoSifen);
        await consultaDeEmpresa(
            empresaId,
            `UPDATE documentos_electronicos
                SET cancelado_en_sifen = true, cancelacion_mensaje = NULL, cancelacion_en = now()
              WHERE id = $1`,
            [de.de_id]
        );
        return { aplicable: true, ok: true, mensaje: 'Cancelada en SIFEN' };
    } catch (error) {
        const mensaje = error instanceof ErrorConector ? error.message : 'No se pudo cancelar en SIFEN';
        await consultaDeEmpresa(
            empresaId,
            `UPDATE documentos_electronicos SET cancelacion_mensaje = $2, cancelacion_en = now() WHERE id = $1`,
            [de.de_id, mensaje]
        );
        return { aplicable: true, ok: false, mensaje };
    }
}

// POST /api/ventas/:id/cancelar-sifen  { motivo }
// Reintenta la cancelación en SIFEN de una venta ya anulada (p. ej. facturas
// anuladas antes de que existiera este paso, o si la primera vez SIFEN no
// respondió).
export async function cancelarVentaEnSifen(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;
    const motivo = String(req.body?.motivo || '').trim();

    const v = await consultaDeEmpresa(
        empresaId,
        `SELECT anulada, motivo_anulacion FROM ventas WHERE id = $1`,
        [id]
    );
    if (!v.rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });
    if (!v.rows[0].anulada) {
        return res.status(400).json({ error: 'Primero anulá la venta en EMPREMAS' });
    }

    const resultado = await cancelarFacturaEnSifen(empresaId, id, motivo || v.rows[0].motivo_anulacion || 'Anulación');
    if (!resultado.aplicable) {
        return res.status(400).json({ error: 'Esta venta no tiene Factura Legal aprobada para cancelar en SIFEN' });
    }
    if (!resultado.ok) {
        return res.status(422).json({ error: resultado.mensaje });
    }
    res.json(resultado);
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

    // Distinto de porFormaPago (esa es la forma en que se cobró - efectivo/
    // tarjeta/transferencia - y una venta a crédito recién cargada no tiene
    // ningún venta_pagos todavía). Esto es tipo_pago (contado/credito/
    // mayorista), la clasificación de la venta en sí - mismo campo que ya
    // usa el resumen de "Ventas de hoy" (resumenDia, más arriba en este
    // archivo) para su desglose Contado/Crédito.
    const porTipoPago = await consultaDeEmpresa(
        empresaId,
        `SELECT tipo_pago, COUNT(*) AS cantidad_ventas, COALESCE(SUM(total), 0) AS total
         FROM ventas
         WHERE anulada = false AND creado_en >= $1::date AND creado_en < ($2::date + INTERVAL '1 day')
         GROUP BY tipo_pago`,
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
        porTipoPago: porTipoPago.rows,
    });
}
