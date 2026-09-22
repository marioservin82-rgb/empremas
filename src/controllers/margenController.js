import { consultaDeEmpresa } from '../config/db.js';

// Pesos relativos por categoria de rotacion: un producto de baja
// rotacion necesita dejar mas margen por unidad (se vende poco), uno de
// alta rotacion puede dejar menos (el volumen ya lo compensa). Son
// constantes fijas en v1, no configurables - se escalan para que el
// promedio ponderado (por lo que realmente vendio cada categoria en los
// ultimos 90 dias) de justo el margen promedio que la empresa necesita.
const PESO_ROTACION = { alta: 0.65, media: 1, baja: 1.4 };

const DIAS_VENTANA_FINANCIERA = 30;
const DIAS_VENTANA_ROTACION = 90;

// Nunca escribe ningun precio - solo calcula un numero para mostrar
// como sugerencia. La decision final de que precio cargar es siempre
// del dueño.
export async function obtenerRecomendacionMargen(req, res) {
    const { empresaId } = req.usuario;
    const { id } = req.params;

    const empresa = await consultaDeEmpresa(
        empresaId,
        `SELECT recomendacion_margen_habilitada, meta_ganancia_mensual FROM empresas WHERE id = $1`,
        [empresaId]
    );
    const fila = empresa.rows[0];
    if (!fila?.recomendacion_margen_habilitada) {
        return res.json({ habilitado: false });
    }
    if (fila.meta_ganancia_mensual == null) {
        return res.json({
            habilitado: true,
            clasificado: false,
            motivo: 'Todavía no configuraste tu meta de ganancia mensual en Perfil de Empresa.',
        });
    }
    const metaGananciaMensual = Number(fila.meta_ganancia_mensual);

    const producto = await consultaDeEmpresa(
        empresaId,
        `SELECT id, precio_costo, categoria_rotacion_manual, es_servicio FROM productos WHERE id = $1`,
        [id]
    );
    if (!producto.rows[0]) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    // Sin costo cargado (tipico de un servicio de Agenda de citas, que no
    // tiene mercaderia detras) el "margen sobre el costo" no tiene sentido -
    // no hay nada de que calcular un recargo.
    if (producto.rows[0].es_servicio || !(Number(producto.rows[0].precio_costo) > 0)) {
        return res.json({
            habilitado: true,
            clasificado: false,
            motivo: 'Este producto no tiene un costo de mercadería cargado — la recomendación de margen no aplica.',
        });
    }

    // Base financiera: gastos operativos + consumo interno + merma de los
    // ultimos 30 dias, mismo criterio que Balance del mes (ver
    // gastosController.obtenerBalanceMensual) - no se reusa esa funcion
    // directamente porque esta necesita ademas el costo promedio y el
    // desglose por producto de los ultimos 90 dias.
    const gastosPorCategoria = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(monto), 0) AS total FROM gastos
         WHERE categoria <> 'equipos_inversion' AND fecha_gasto >= CURRENT_DATE - $1::int`,
        [DIAS_VENTANA_FINANCIERA]
    );
    const consumoInternoYMerma = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(cantidad * costo_unitario), 0) AS total FROM salidas_stock
         WHERE motivo IN ('consumo_interno', 'merma_vencimiento', 'rotura_robo')
           AND fecha >= CURRENT_DATE - $1::int`,
        [DIAS_VENTANA_FINANCIERA]
    );
    const costoMercaderia30d = await consultaDeEmpresa(
        empresaId,
        `SELECT COALESCE(SUM(vi.cantidad * vi.costo_unitario), 0) AS total
         FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
         WHERE v.anulada = false AND v.creado_en >= now() - ($1::int || ' days')::interval`,
        [DIAS_VENTANA_FINANCIERA]
    );

    const gastosOperativos = Number(gastosPorCategoria.rows[0].total);
    const montoConsumoYMerma = Number(consumoInternoYMerma.rows[0].total);
    const montoCostoMercaderia30d = Number(costoMercaderia30d.rows[0].total);

    if (montoCostoMercaderia30d <= 0) {
        return res.json({
            habilitado: true,
            clasificado: false,
            motivo: 'Todavía no hay suficiente historial de ventas este último mes para calcular una recomendación.',
        });
    }

    const margenPromedioNecesario =
        (gastosOperativos + montoConsumoYMerma + metaGananciaMensual) / montoCostoMercaderia30d;

    // Clasificacion por rotacion: costo total vendido de cada producto en
    // los ultimos 90 dias (mas ventana que la financiera, para que un
    // producto de baja rotacion real no quede afuera solo por no
    // venderse en las ultimas 4 semanas justo).
    const costoPorProducto = await consultaDeEmpresa(
        empresaId,
        `SELECT vi.producto_id, SUM(vi.cantidad * vi.costo_unitario) AS costo_total
         FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
         WHERE v.anulada = false AND v.creado_en >= now() - ($1::int || ' days')::interval
         GROUP BY vi.producto_id
         ORDER BY costo_total DESC`,
        [DIAS_VENTANA_ROTACION]
    );

    const filas = costoPorProducto.rows.map((f) => ({ productoId: f.producto_id, costo: Number(f.costo_total) }));
    const tercio = Math.ceil(filas.length / 3);
    const categoriaPorProducto = new Map();
    filas.forEach((f, i) => {
        const categoria = i < tercio ? 'alta' : i < tercio * 2 ? 'media' : 'baja';
        categoriaPorProducto.set(f.productoId, categoria);
    });

    const costoTotalClasificado = filas.reduce((acumulado, f) => acumulado + f.costo, 0);
    const costoPorCategoria = { alta: 0, media: 0, baja: 0 };
    filas.forEach((f) => {
        costoPorCategoria[categoriaPorProducto.get(f.productoId)] += f.costo;
    });

    let margenPorCategoria;
    if (costoTotalClasificado > 0) {
        const proporcion = {
            alta: costoPorCategoria.alta / costoTotalClasificado,
            media: costoPorCategoria.media / costoTotalClasificado,
            baja: costoPorCategoria.baja / costoTotalClasificado,
        };
        const denominador =
            PESO_ROTACION.alta * proporcion.alta +
            PESO_ROTACION.media * proporcion.media +
            PESO_ROTACION.baja * proporcion.baja;
        const escala = denominador > 0 ? margenPromedioNecesario / denominador : margenPromedioNecesario;
        margenPorCategoria = {
            alta: Math.max(0, escala * PESO_ROTACION.alta),
            media: Math.max(0, escala * PESO_ROTACION.media),
            baja: Math.max(0, escala * PESO_ROTACION.baja),
        };
    } else {
        // Todavia no hay suficiente venta clasificada como para diferenciar
        // por categoria - se sugiere el mismo margen parejo para todas.
        margenPorCategoria = {
            alta: Math.max(0, margenPromedioNecesario),
            media: Math.max(0, margenPromedioNecesario),
            baja: Math.max(0, margenPromedioNecesario),
        };
    }

    const categoria = categoriaPorProducto.get(id) || producto.rows[0].categoria_rotacion_manual || null;
    if (!categoria) {
        return res.json({
            habilitado: true,
            clasificado: false,
            motivo: 'Este producto todavía no tiene ventas — elegí a mano cómo creés que va a rotar para tener una sugerencia.',
        });
    }

    const margenSugeridoPct = margenPorCategoria[categoria];
    const precioCosto = Number(producto.rows[0].precio_costo);

    res.json({
        habilitado: true,
        clasificado: true,
        categoria,
        margenSugeridoPct: Math.round(margenSugeridoPct * 1000) / 1000,
        precioSugerido: Math.round(precioCosto * (1 + margenSugeridoPct)),
    });
}
