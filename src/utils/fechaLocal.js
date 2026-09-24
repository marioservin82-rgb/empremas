// Interpreta una fecha escrita con formato local (DD/MM/AAAA, como
// Paraguay/Excel en español) o el formato ISO que ya usan los inputs
// type="date" del propio sistema (AAAA-MM-DD). Usado por las
// importaciones masivas (ej. fecha_nacimiento de clientes) para aceptar
// una planilla real sin exigirle el formato ISO a mano.
// Devuelve "AAAA-MM-DD" (listo para guardar), null si el valor viene
// vacío, o NaN si el valor no se pudo interpretar como fecha.
export function fechaLocal(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    const texto = String(valor).trim();
    if (texto === '') return null;

    const isoMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return validarFecha(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])) ? texto : NaN;
    }

    const localMatch = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (localMatch) {
        const dia = Number(localMatch[1]);
        const mes = Number(localMatch[2]);
        const anio = Number(localMatch[3]);
        if (!validarFecha(anio, mes, dia)) return NaN;
        return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }

    return NaN;
}

function validarFecha(anio, mes, dia) {
    if (!(anio >= 1900 && anio <= 2100)) return false;
    if (!(mes >= 1 && mes <= 12)) return false;
    const diasDelMes = new Date(anio, mes, 0).getDate();
    return dia >= 1 && dia <= diasDelMes;
}
