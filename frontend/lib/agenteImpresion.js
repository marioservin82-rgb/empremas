// Cliente del agente de impresion local (ver /agente-impresion en la raiz
// del repo). El agente corre en la compu del comercio, escuchando en
// 127.0.0.1:9100 - los navegadores permiten que una pagina HTTPS le pegue
// a localhost/127.0.0.1 sin bloqueo de contenido mixto, por eso esto
// funciona igual en localhost:3000 (dev) que en el sitio de produccion.
const URL_AGENTE = "http://127.0.0.1:9100";

// Timeout corto a proposito: si el agente no esta instalado/corriendo, el
// fetch a un puerto local sin nada escuchando falla rapido de por si, pero
// por las dudas (firewall, etc.) no queremos que una venta se quede
// esperando varios segundos antes de caer al window.print() de siempre.
function conTimeout(promesa, ms) {
  const controlador = new AbortController();
  const id = setTimeout(() => controlador.abort(), ms);
  return { promesa: promesa(controlador.signal), limpiar: () => clearTimeout(id) };
}

export async function agenteDisponible() {
  const { promesa, limpiar } = conTimeout((signal) => fetch(`${URL_AGENTE}/estado`, { signal }), 700);
  try {
    const resp = await promesa;
    return resp.ok;
  } catch {
    return false;
  } finally {
    limpiar();
  }
}

export async function listarImpresorasAgente() {
  const resp = await fetch(`${URL_AGENTE}/impresoras`);
  if (!resp.ok) throw new Error("No se pudo consultar las impresoras");
  const datos = await resp.json();
  return datos.impresoras;
}

// lineas: [{ texto, negrita?: bool, alineacion?: 'izquierda'|'centro'|'derecha' }]
export async function imprimirEnAgente(impresora, lineas, { cortar = true } = {}) {
  const resp = await fetch(`${URL_AGENTE}/imprimir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ impresora, lineas, cortar }),
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error || "No se pudo imprimir con el agente");
  return datos;
}

// Helper para los puntos de impresion existentes: intenta el agente si hay
// una impresora configurada, y si no esta disponible o falla, ejecuta el
// window.print() de siempre - asi nadie que no instale el agente nota
// ningun cambio de comportamiento.
export async function imprimirTicket(impresoraAgenteNombre, lineas, imprimirConNavegador) {
  if (impresoraAgenteNombre) {
    try {
      if (await agenteDisponible()) {
        await imprimirEnAgente(impresoraAgenteNombre, lineas);
        return "agente";
      }
    } catch {
      // sigue al fallback de abajo
    }
  }
  imprimirConNavegador();
  return "navegador";
}
