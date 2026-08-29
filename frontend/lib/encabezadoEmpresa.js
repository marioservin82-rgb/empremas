// Encabezado de empresa para los documentos propios de EMPREMAS (ticket
// interno, recibo de cobro, extractos, presupuesto). Si la empresa tiene
// nombre de fantasía, se muestra ese como título y la razón social debajo;
// si no, solo la razón social.

export function nombresEmpresa(empresa) {
  const fantasia = String(empresa?.nombre_fantasia || "").trim();
  const razon = String(empresa?.razon_social || "").trim();
  return {
    fantasia,
    razon,
    principal: fantasia || razon,
    secundario: fantasia ? razon : "",
  };
}

// Para los tickets térmicos (imprimirTicket): [{ texto, negrita?, alineacion? }].
export function lineasNombreEmpresa(empresa) {
  const { principal, secundario } = nombresEmpresa(empresa);
  const lineas = [{ texto: principal, negrita: true, alineacion: "centro" }];
  if (secundario) lineas.push({ texto: secundario, alineacion: "centro" });
  return lineas;
}
