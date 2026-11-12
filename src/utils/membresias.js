// Membresias (salones/barberias). El vencimiento sale del ultimo periodo pagado
// (membresia_pagos.periodo_hasta, ignorando pagos anulados) y el estado se
// calcula al leer, sin tareas programadas.

// Fecha de hoy en Paraguay (DATE) para comparar con los periodos.
export const SQL_HOY_PY = `(now() AT TIME ZONE 'America/Asuncion')::date`;

// LEFT JOIN LATERAL con la membresia vigente (no cancelada) del cliente. Deja
// columnas mb_* en la fila: mb_id, mb_plan_nombre, mb_descuento, mb_gracia,
// mb_vence_en (texto YYYY-MM-DD o NULL) y mb_dias (dias hasta vencer, negativo
// si ya vencio; NULL si todavia no pago ninguna cuota). `colCliente` es la
// columna del id de cliente en la consulta que lo usa (ej. "c.id").
export function joinMembresiaVigente(colCliente) {
    return `
        LEFT JOIN LATERAL (
            SELECT m.id AS mb_id, mp.nombre AS mb_plan_nombre,
                   mp.descuento_servicios_pct AS mb_descuento, mp.dias_gracia AS mb_gracia,
                   to_char(v.vence, 'YYYY-MM-DD') AS mb_vence_en,
                   (v.vence - ${SQL_HOY_PY}) AS mb_dias
            FROM membresias m
            JOIN membresia_planes mp ON mp.id = m.plan_id
            LEFT JOIN LATERAL (
                SELECT max(x.periodo_hasta) AS vence FROM membresia_pagos x
                WHERE x.membresia_id = m.id AND x.anulado = false
            ) v ON true
            WHERE m.cliente_id = ${colCliente} AND m.cancelada = false
            LIMIT 1
        ) mb ON true`;
}

// activa | gracia | vencida | pendiente | cancelada
export function estadoDeMembresia({ cancelada, dias, diasGracia }) {
    if (cancelada) return 'cancelada';
    if (dias === null || dias === undefined) return 'pendiente';
    if (Number(dias) >= 0) return 'activa';
    if (Number(dias) >= -Number(diasGracia)) return 'gracia';
    return 'vencida';
}

// Resumen para el front (insignia): null si el cliente no tiene membresia.
// El descuento solo cuenta mientras la membresia esta activa o en gracia.
export function resumenDeMembresia(fila) {
    if (!fila || !fila.mb_id) return null;
    const estado = estadoDeMembresia({ cancelada: false, dias: fila.mb_dias, diasGracia: fila.mb_gracia });
    const conBeneficio = estado === 'activa' || estado === 'gracia';
    return {
        id: fila.mb_id,
        plan: fila.mb_plan_nombre,
        venceEn: fila.mb_vence_en,
        dias: fila.mb_dias === null ? null : Number(fila.mb_dias),
        estado,
        descuentoServiciosPct: conBeneficio ? Number(fila.mb_descuento) : 0,
    };
}

// Saca las columnas mb_* de una fila (resultado de joinMembresiaVigente) y
// devuelve { resto, membresia }.
export function separarMembresia(fila) {
    const { mb_id, mb_plan_nombre, mb_descuento, mb_gracia, mb_vence_en, mb_dias, ...resto } = fila;
    return {
        resto,
        membresia: resumenDeMembresia({ mb_id, mb_plan_nombre, mb_descuento, mb_gracia, mb_vence_en, mb_dias }),
    };
}

// Columnas a pedir junto con joinMembresiaVigente.
export const COLUMNAS_MEMBRESIA = `mb.mb_id, mb.mb_plan_nombre, mb.mb_descuento, mb.mb_gracia, mb.mb_vence_en, mb.mb_dias`;
