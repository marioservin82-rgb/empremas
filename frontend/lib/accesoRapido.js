// Acceso rápido favorito: un 6to botón grande, elegido por el dueño en Mi
// Empresa, que se agrega al panel principal para que la grilla quede
// siempre pareja (3x2) en vez de desparejarse cuando el conteo natural de
// botones da 5. El valor guardado (empresa.acceso_rapido_favorito) es la
// clave lógica de abajo, no una URL - así se puede validar a qué rol y a
// qué módulo activo aplica cada una antes de mostrarla.
export const OPCIONES_ACCESO_RAPIDO = [
  { valor: "registrar_compra", nombre: "Registrar compra", icono: "🧾", href: "/compras/nueva", roles: ["dueno", "encargado"] },
  { valor: "historial_compras", nombre: "Historial de compras", icono: "📜", href: "/compras", roles: ["dueno", "encargado"] },
  { valor: "nuevo_gasto", nombre: "Nuevo gasto", icono: "💸", href: "/gastos/nuevo", roles: ["dueno"] },
  { valor: "ver_gastos", nombre: "Gastos", icono: "💸", href: "/gastos", roles: ["dueno"] },
  { valor: "balance_mes", nombre: "Balance del mes", icono: "📊", href: "/gastos/balance", roles: ["dueno"] },
  { valor: "ajustar_stock", nombre: "Ajustar inventario", icono: "📦", href: "/stock/inventario/ajuste", roles: ["dueno", "encargado"] },
  { valor: "nuevo_producto", nombre: "Nuevo producto", icono: "🏷️", href: "/stock/nuevo", roles: ["dueno", "encargado"] },
  { valor: "importar_productos", nombre: "Importar productos (CSV)", icono: "📥", href: "/stock/importar", roles: ["dueno", "encargado"] },
  { valor: "valorizado_stock", nombre: "Valorizado de stock", icono: "📦", href: "/stock/inventario/valorizado", roles: ["dueno", "encargado"] },
  { valor: "nuevo_cliente", nombre: "Nuevo cliente", icono: "🧑", href: "/clientes/nuevo", roles: ["dueno", "encargado", "cajero"] },
  { valor: "resumen_credito", nombre: "Resumen de crédito", icono: "📄", href: "/clientes/saldos", roles: ["dueno", "encargado"] },
  { valor: "proveedores", nombre: "Proveedores / Pedido inteligente", icono: "📋", href: "/proveedores", roles: ["dueno", "encargado"] },
  { valor: "nuevo_proveedor", nombre: "Nuevo proveedor", icono: "🧑‍🔧", href: "/proveedores/nuevo", roles: ["dueno", "encargado"] },
  { valor: "nuevo_presupuesto", nombre: "Nuevo presupuesto", icono: "📝", href: "/presupuestos/nuevo", roles: ["dueno", "encargado", "cajero"] },
  { valor: "presupuestos", nombre: "Presupuestos", icono: "📝", href: "/presupuestos", roles: ["dueno", "encargado", "cajero"] },
  { valor: "consumo_interno", nombre: "Consumo interno", icono: "🏠", href: "/gastos/salida-stock?motivo=consumo_interno", roles: ["dueno"] },
  { valor: "ventas_hoy", nombre: "Ventas de hoy", icono: "📊", href: "/ventas/resumen-dia", roles: ["dueno", "encargado", "cajero"] },
  { valor: "credito_cobrado_hoy", nombre: "Crédito cobrado hoy", icono: "💵", href: "/clientes/cobros-dia", roles: ["dueno", "encargado", "cajero"] },
  { valor: "nueva_cita", nombre: "Nueva cita", icono: "📅", href: "/citas/nueva", roles: ["dueno", "encargado", "cajero"], modulo: "citas_habilitadas" },
  { valor: "profesionales_citas", nombre: "Profesionales (Agenda)", icono: "📅", href: "/citas/profesionales", roles: ["dueno", "encargado"], modulo: "citas_habilitadas" },
  { valor: "nueva_reparacion", nombre: "Nueva recepción", icono: "🔧", href: "/reparaciones/nueva", roles: ["dueno", "encargado", "cajero"], modulo: "reparaciones_habilitadas" },
  { valor: "nueva_mascota", nombre: "Nueva mascota", icono: "🐾", href: "/mascotas/nueva", roles: ["dueno", "encargado", "cajero"], modulo: "mascotas_habilitadas" },
  { valor: "vacunas_por_vencer", nombre: "Vacunas por vencer", icono: "💉", href: "/mascotas/vacunas-por-vencer", roles: ["dueno", "encargado", "cajero"], modulo: "mascotas_habilitadas" },
  { valor: "produccion", nombre: "Producción", icono: "🏭", href: "/produccion", roles: ["dueno", "encargado"], modulo: "produccion_habilitada" },
  { valor: "mesas", nombre: "Mesas", icono: "🍽️", href: "/mesas", roles: ["dueno", "encargado", "cajero"], modulo: "lomiteria_habilitada" },
  { valor: "cocina", nombre: "Cocina", icono: "🍳", href: "/cocina", roles: ["dueno", "encargado", "cajero"], modulo: "lomiteria_habilitada" },
  { valor: "vendedores", nombre: "Vendedores", icono: "🤝", href: "/vendedores", roles: ["dueno", "encargado"], modulo: "comisiones_habilitadas" },
  { valor: "traslado_nuevo", nombre: "Traslado entre sucursales", icono: "🚚", href: "/stock/traslados/nuevo", roles: ["dueno", "encargado"], modulo: "multi_sucursal" },
  { valor: "traslados", nombre: "Traslados", icono: "📋", href: "/stock/traslados", roles: ["dueno", "encargado"], modulo: "multi_sucursal" },
  { valor: "pedidos_sucursal", nombre: "Pedidos de sucursales", icono: "📥", href: "/stock/pedidos", roles: ["dueno", "encargado"], modulo: "multi_sucursal" },
];

// Devuelve la ficha {nombre, icono, href} a mostrar en el panel, o null si
// el favorito no está configurado, no existe, o no aplica para este rol o
// para los módulos activos de esta empresa (ej. el dueño eligió "Nueva
// cita" pero la vio otro cliente sin Agenda de citas activada).
export function resolverAccesoRapido(valor, rol, flagsModulos = {}) {
  if (!valor) return null;
  const opcion = OPCIONES_ACCESO_RAPIDO.find((o) => o.valor === valor);
  if (!opcion) return null;
  if (!opcion.roles.includes(rol)) return null;
  if (opcion.modulo && !flagsModulos[opcion.modulo]) return null;
  return { nombre: opcion.nombre, icono: opcion.icono, href: opcion.href };
}
