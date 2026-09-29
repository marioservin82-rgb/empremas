// Horario de atención del salón para Reservas públicas - ver
// db/migracion-horario-atencion.sql para la forma exacta del JSON.
export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Mediodia (no medianoche) evita cualquier corrimiento de dia por huso
// horario - que dia calendario es una fecha no depende del huso horario,
// asi que esto es seguro sin importar en que timezone corra el proceso.
export function diaSemanaDe(fechaISO) {
    return DIAS_SEMANA[new Date(`${fechaISO}T12:00:00`).getDay()];
}

export function minutos(horaHHMM) {
    const [h, m] = horaHHMM.split(':').map(Number);
    return h * 60 + m;
}

export function validarHorario(horario) {
    if (!horario || typeof horario !== 'object') {
        throw new Error('El horario de atención no es válido');
    }
    const claves = Object.keys(horario);
    if (claves.length !== DIAS_SEMANA.length || !DIAS_SEMANA.every((d) => claves.includes(d))) {
        throw new Error('El horario de atención debe tener los 7 días de la semana');
    }
    for (const dia of DIAS_SEMANA) {
        const v = horario[dia];
        if (!v || typeof v.abierto !== 'boolean') {
            throw new Error(`El día ${dia} no tiene un valor válido`);
        }
        if (v.abierto) {
            if (!/^\d{2}:\d{2}$/.test(v.desde) || !/^\d{2}:\d{2}$/.test(v.hasta)) {
                throw new Error(`El horario del día ${dia} debe tener desde y hasta en formato HH:MM`);
            }
            if (minutos(v.desde) >= minutos(v.hasta)) {
                throw new Error(`El horario del día ${dia} debe empezar antes de terminar`);
            }
        }
    }
}

export function estaDentroDeHorario(horario, fecha, hora, duracionMinutos) {
    const dia = horario[diaSemanaDe(fecha)];
    if (!dia || !dia.abierto) return false;
    const inicio = minutos(hora);
    const fin = inicio + Number(duracionMinutos || 0);
    return inicio >= minutos(dia.desde) && fin <= minutos(dia.hasta);
}
