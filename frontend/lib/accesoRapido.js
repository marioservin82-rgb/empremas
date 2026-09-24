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
  { valor: "ajustar_stock", nombre: "Ajustar inventario", icono: "📦", href: "/stock/inventario/ajuste", roles: ["dueno", "encargado"] },
  { valor: "nuevo_producto", nombre: "Nuevo producto", icono: "🏷️", href: "/stock/nuevo", roles: ["dueno", "encargado"] },
  { valor: "nuevo_cliente", nombre: "Nuevo cliente", icono: "🧑", href: "/clientes/nuevo", roles: ["dueno", "encargado", "cajero"] },
  { valor: "nueva_cita", nombre: "Nueva cita", icono: "📅", href: "/citas/nueva", roles: ["dueno", "encargado", "cajero"], modulo: "citas_habilitadas" },
  { valor: "nueva_reparacion", nombre: "Nueva recepción", icono: "🔧", href: "/reparaciones/nueva", roles: ["dueno", "encargado", "cajero"], modulo: "reparaciones_habilitadas" },
  { valor: "nueva_mascota", nombre: "Nueva mascota", icono: "🐾", href: "/mascotas/nueva", roles: ["dueno", "encargado", "cajero"], modulo: "mascotas_habilitadas" },
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
