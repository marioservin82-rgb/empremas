// Convierte "YYYY-MM" (o nada, que cae al mes actual) en un rango
// [desde, hasta] de fechas (YYYY-MM-DD) que cubre ese mes completo.
export function rangoDelMes(mes) {
    const [anioStr, mesStr] = (mes || new Date().toISOString().slice(0, 7)).split('-');
    const anio = Number(anioStr);
    const mesIndice = Number(mesStr) - 1;
    const desde = new Date(Date.UTC(anio, mesIndice, 1)).toISOString().slice(0, 10);
    const hasta = new Date(Date.UTC(anio, mesIndice + 1, 0)).toISOString().slice(0, 10);
    return { desde, hasta };
}
