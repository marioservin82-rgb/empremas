const formatoGs = new Intl.NumberFormat("es-PY");

function fechaLegible(iso) {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY");
}

// Los placeholders de RUC y telefono llevan su propia puntuacion (parentesis
// / "al ...") en vez de vivir fijos en el texto de la plantilla - asi, si el
// dueno apaga "incluir RUC"/"incluir telefono" en la configuracion, la frase
// entera desaparece prolija en vez de dejar un "()" vacio o una oracion
// coja. El significado es el mismo que pidio Mario, solo cambia donde vive
// la puntuacion.
export const PLANTILLAS_POR_DEFECTO = {
  previo:
    "Hola [Nombre] 👋, le escribe [Nombre del comercio][RUC del comercio]. Le recordamos que su factura N° [Número] por Gs. [Monto] vence el [Fecha de vencimiento]. Su saldo total pendiente en este momento es de Gs. [Saldo total]. Cualquier consulta, estamos a su disposición[Teléfono del comercio]. ¡Que tenga un buen día!",
  hoy:
    "Hola [Nombre], le escribe [Nombre del comercio][RUC del comercio]. Le recordamos que hoy vence su factura N° [Número] por Gs. [Monto]. Su saldo total pendiente es de Gs. [Saldo total]. Quedamos atentos para coordinar el pago. ¡Gracias por su confianza!",
  mora_leve:
    "Hola [Nombre], le escribe [Nombre del comercio][RUC del comercio]. Notamos que la factura N° [Número] por Gs. [Monto], vencida el [Fecha de vencimiento], sigue pendiente. Su saldo total pendiente en este momento es de Gs. [Saldo total]. Le agradecemos regularizarlo a la brevedad. Ante cualquier inconveniente, no dude en escribirnos[Teléfono del comercio].",
  mora_prolongada:
    "Hola [Nombre], le escribe [Nombre del comercio][RUC del comercio]. Su factura N° [Número] por Gs. [Monto] continúa pendiente desde el [Fecha de vencimiento], y su saldo total pendiente es de Gs. [Saldo total]. Le pedimos coordinar el pago a la brevedad para poder seguir atendiéndolo con normalidad. Quedamos a su disposición[Teléfono del comercio].",
};

export const ETIQUETA_CATEGORIA_RECORDATORIO = {
  previo: "Vence pronto",
  hoy: "Vence hoy",
  mora_leve: "Vencida",
  mora_prolongada: "Mora prolongada",
};

// null = no corresponde recordatorio (nada vencido ni por vencer dentro del
// aviso previo configurado).
export function categoriaRecordatorio(vencimientoISO, diasAvisoPrevio, diasMoraProlongada) {
  if (!vencimientoISO) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(`${vencimientoISO.slice(0, 10)}T00:00:00`);
  const dias = Math.round((hoy - vencimiento) / 86400000); // positivo = atrasado, negativo = falta

  if (dias > diasMoraProlongada) return "mora_prolongada";
  if (dias >= 1) return "mora_leve";
  if (dias === 0) return "hoy";
  if (dias >= -diasAvisoPrevio) return "previo";
  return null;
}

// cliente: fila de /api/clientes (con recordatorio_numero/monto/vencimiento
// agregados por el LATERAL JOIN). empresa: /api/empresas/actual.
// Devuelve null si esta fuera de la ventana de aviso (nada que recordar).
export function construirMensajeRecordatorio(cliente, empresa) {
  const diasAvisoPrevio = empresa.recordatorio_dias_aviso_previo ?? 3;
  const diasMoraProlongada = empresa.recordatorio_dias_mora_prolongada ?? 7;
  const categoria = categoriaRecordatorio(cliente.recordatorio_vencimiento, diasAvisoPrevio, diasMoraProlongada);
  if (!categoria) return null;

  const plantilla = empresa[`recordatorio_mensaje_${categoria}`] || PLANTILLAS_POR_DEFECTO[categoria];

  const incluirRuc = empresa.recordatorio_incluir_ruc ?? true;
  const incluirTelefono = empresa.recordatorio_incluir_telefono ?? true;
  const ruc = incluirRuc && empresa.ruc ? ` (RUC ${empresa.ruc})` : "";
  const telefono = incluirTelefono && empresa.telefono ? ` al ${empresa.telefono}` : "";

  const texto = plantilla
    .replaceAll("[Nombre del comercio]", empresa.razon_social ?? "")
    .replaceAll("[RUC del comercio]", ruc)
    .replaceAll("[Teléfono del comercio]", telefono)
    .replaceAll("[Nombre]", cliente.nombre ?? "")
    .replaceAll("[Número]", cliente.recordatorio_numero ?? "")
    .replaceAll("[Monto]", formatoGs.format(cliente.recordatorio_monto))
    .replaceAll("[Fecha de vencimiento]", fechaLegible(cliente.recordatorio_vencimiento))
    .replaceAll("[Saldo total]", formatoGs.format(cliente.saldo));

  return { categoria, texto };
}
