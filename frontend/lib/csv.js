// Parser CSV chico (soporta campos entre comillas, comas/punto y coma
// como separador) — evita sumar una dependencia solo para esto. Detecta
// el separador mirando la primera linea, asi sirve tanto para un CSV
// exportado en ingles (coma) como en español/Excel local (punto y coma).
function detectarDelimitador(primeraLinea) {
  const comas = (primeraLinea.match(/,/g) || []).length;
  const puntoYComa = (primeraLinea.match(/;/g) || []).length;
  return puntoYComa > comas ? ";" : ",";
}

export function parsearCsv(texto) {
  const primeraLinea = texto.split("\n")[0] || "";
  const delimitador = detectarDelimitador(primeraLinea);

  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const siguiente = texto[i + 1];

    if (entreComillas) {
      if (c === '"' && siguiente === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === delimitador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c === "\r") {
      // se ignora, el \n que sigue cierra la fila
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((valor) => valor.trim() !== ""));
}

// Convierte filas CSV (encabezado en la primera fila) en objetos
// {columna: valor}, con el encabezado normalizado (minúsculas, sin
// espacios) como clave.
export function filasAObjetos(filas) {
  if (filas.length === 0) return [];
  const encabezado = filas[0].map((h) => h.trim().toLowerCase());
  return filas.slice(1).map((fila) => {
    const obj = {};
    encabezado.forEach((clave, indice) => {
      obj[clave] = (fila[indice] ?? "").trim();
    });
    return obj;
  });
}
