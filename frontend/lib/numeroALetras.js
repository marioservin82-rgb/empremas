// Convierte un monto entero (sin decimales - el guarani no usa centavos en
// la practica) a su forma en letras, para el comprobante de retiro de caja.
// Cubre hasta 999.999.999 (mas que de sobra para un comercio chico).
const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const DIECIS = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
const VEINTIS = ["veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function convertirDecenas(n) {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DIECIS[n - 10];
  if (n < 30) return VEINTIS[n - 20];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
}

function convertirCentenas(n) {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) partes.push(convertirDecenas(resto));
  return partes.join(" ");
}

// "uno"/"veintiuno" pierden la "o" final delante de un sustantivo (mil,
// millon/millones, o el propio "guaranies" al final) - "veintiun mil", no
// "veintiuno mil". Por como se arma la cadena, "uno"/"veintiuno" siempre
// termina siendo la ULTIMA palabra del segmento (aunque tenga centena
// adelante: "ciento veintiuno") - por eso se mira solo esa ultima palabra,
// en vez de un endsWith(" uno") que se rompia con compuestos sin espacio
// como "veintiuno" pegado a la centena ("ciento veintiuno" -> quedaba sin
// convertir en vez de "ciento veintiún").
function apocope(texto) {
  const palabras = texto.split(" ");
  const ultima = palabras[palabras.length - 1];
  if (ultima === "uno") palabras[palabras.length - 1] = "un";
  else if (ultima === "veintiuno") palabras[palabras.length - 1] = "veintiún";
  else return texto;
  return palabras.join(" ");
}

export function montoEnLetras(numero) {
  const entero = Math.round(Math.abs(Number(numero)) || 0);
  if (entero === 0) return "Cero guaraníes";

  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1000);
  const cientos = entero % 1000;

  const partes = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "un millón" : `${apocope(convertirCentenas(millones))} millones`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${apocope(convertirCentenas(miles))} mil`);
  }
  if (cientos > 0) {
    partes.push(apocope(convertirCentenas(cientos)));
  }

  let texto = partes.join(" ").trim();
  texto = texto.charAt(0).toUpperCase() + texto.slice(1);

  // Singular solo para exactamente 1 ("un guaraní"), igual que "un dólar"/
  // "un peso" - "cero guaraníes" sigue en plural.
  if (entero === 1) return `${texto} guaraní`;

  // "un millon DE guaranies" cuando no sigue nada mas despues del millon,
  // pero "un millon doscientos mil guaranies" (sin "de") si sigue algo.
  const soloMillones = millones > 0 && miles === 0 && cientos === 0;
  return soloMillones ? `${texto} de guaraníes` : `${texto} guaraníes`;
}
