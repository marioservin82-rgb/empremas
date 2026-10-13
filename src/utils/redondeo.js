// El guarani no tiene centavos: cada linea de una venta se redondea a entero
// con la misma regla que usa el conector SIFEN (Math.round: 0,5 sube), asi el
// total de EMPREMAS coincide con el de la factura electronica.
export function redondearGs(valor) {
    return Math.round(Number(valor));
}
