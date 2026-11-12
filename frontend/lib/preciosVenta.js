import { redondearGs } from "./redondeo";

// Precios y subtotales de una linea de Vender. Mismo calculo que hace el
// servidor en crearVenta: se repite aca para que el cajero vea el total real
// ANTES de confirmar (necesita saber cuanto cobrar). Si se cambia una regla
// aca hay que cambiarla tambien en src/controllers/ventasController.js.
//
// `beneficios` = { beneficioMayoristaAutomatico, beneficioDescuentoAdicionalPct,
// membresiaPct } (categoria de fidelizacion del cliente + descuento en
// servicios de su membresia vigente, 0 si no tiene o esta vencida).

// Un item que llego de convertir un presupuesto (o de una cita) trae su propio
// precio fijo: se respeta en vez de recalcular con el precio de catalogo. Fuera
// de ese caso, un item marcado como mayorista (o el beneficio automatico de la
// categoria del cliente) usa el precio mayorista, solo en ventas al contado.
export function precioDe(item, tipoPago, beneficios) {
  if (item.precioFijo != null) return item.precioFijo;
  const usaMayorista = tipoPago === "contado" && (item.esMayorista || beneficios?.beneficioMayoristaAutomatico);
  let precio = usaMayorista ? item.precios.mayorista : item.precios[tipoPago];
  const descuentoPct = beneficios?.beneficioDescuentoAdicionalPct || 0;
  if (descuentoPct > 0 && !membresiaGana(item, beneficios)) {
    precio = Math.round(precio * (1 - descuentoPct / 100));
  }
  return precio;
}

// El descuento de membresia aplica solo a servicios y no se suma al de la
// categoria del cliente: se aplica el mayor de los dos. Un precio fijo (cita,
// presupuesto) nunca recibe el descuento de categoria, asi que ahi la membresia
// siempre gana.
export function membresiaGana(item, beneficios) {
  const pct = beneficios?.membresiaPct || 0;
  if (!(pct > 0) || !item.esServicio) return false;
  const categoriaPct = item.precioFijo != null ? 0 : beneficios?.beneficioDescuentoAdicionalPct || 0;
  return pct > categoriaPct;
}

// Monto del descuento de membresia de una linea (guaranies enteros).
export function descuentoMembresiaDe(item, tipoPago, beneficios) {
  if (!membresiaGana(item, beneficios)) return 0;
  // La cantidad se guarda con 3 decimales (igual que el servidor).
  const bruto = precioDe(item, tipoPago, beneficios) * (Math.round(item.cantidad * 1000) / 1000);
  return Math.round((bruto * beneficios.membresiaPct) / 100);
}

// Subtotal de una linea: resta el descuento manual (boton "Descuento") y el de
// membresia. Nunca queda negativo. Cada linea se redondea a guarani entero,
// igual que el servidor, para que el total mostrado sea el que se guarda.
export function subtotalDe(item, tipoPago, beneficios) {
  const bruto = precioDe(item, tipoPago, beneficios) * (Math.round(item.cantidad * 1000) / 1000);
  const descuentos = (Number(item.descuentoMonto) || 0) + descuentoMembresiaDe(item, tipoPago, beneficios);
  return redondearGs(Math.max(bruto - descuentos, 0));
}
