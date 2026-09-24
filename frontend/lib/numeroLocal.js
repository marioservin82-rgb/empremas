// Misma logica que src/utils/numeroLocal.js (backend) - se duplica acá
// para poder validar una fila de importación en el navegador, ANTES de
// mandarla, con el mismo criterio exacto que el servidor va a aplicar
// después. Ver ese archivo para la explicación completa del formato.
export function numeroLocal(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  let texto = String(valor).trim();
  if (texto === "") return null;

  const tieneComa = texto.includes(",");
  const tienePunto = texto.includes(".");

  if (tieneComa && tienePunto) {
    const separadorDecimal = texto.lastIndexOf(",") > texto.lastIndexOf(".") ? "," : ".";
    const separadorMiles = separadorDecimal === "," ? "." : ",";
    texto = texto.split(separadorMiles).join("");
    if (separadorDecimal === ",") texto = texto.replace(",", ".");
  } else if (tieneComa) {
    const partes = texto.split(",");
    if (partes.length > 2 || partes[partes.length - 1].length === 3) {
      texto = texto.split(",").join("");
    } else {
      texto = texto.replace(",", ".");
    }
  } else if (tienePunto) {
    const partes = texto.split(".");
    if (partes.length > 2 || partes[partes.length - 1].length === 3) {
      texto = texto.split(".").join("");
    }
  }

  const numero = Number(texto);
  return Number.isNaN(numero) ? NaN : numero;
}
