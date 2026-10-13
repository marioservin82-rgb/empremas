// El guarani no tiene centavos: cada linea de una venta se redondea a entero
// con la misma regla que el servidor y que el conector SIFEN (Math.round:
// 0,5 sube), asi el total que se muestra coincide con el que se guarda.
// Igual a src/utils/redondeo.js del backend (no hay import compartido).
export function redondearGs(valor) {
  return Math.round(Number(valor));
}
