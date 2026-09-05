// Pie de "publicidad" de EMPREMAS: aparece al final de los documentos que
// le llegan a alguien AFUERA del negocio (presupuesto, ticket comun,
// extracto de cliente/proveedor) - vidriera pasiva y gratuita para la
// plataforma. Nunca en la Factura Legal (documento tributario ante SIFEN,
// no corresponde agregarle nada ajeno) ni en el Recibo de Cobro (ya tiene
// su propio cierre con sello "PAGADO").
//
// Version texto plano, para los tickets termicos (imprimirTicket). La
// version visual (JSX) vive en components/PiePublicidadEmpremas.js.
export function lineasPiePublicidadEmpremas(numeroSoporte) {
  const lineas = [
    { texto: "Generado por EMPREMAS", alineacion: "centro" },
    { texto: "Gestión comercial de negocios y facturación electrónica", alineacion: "centro" },
  ];
  if (numeroSoporte) lineas.push({ texto: numeroSoporte, alineacion: "centro" });
  return lineas;
}
