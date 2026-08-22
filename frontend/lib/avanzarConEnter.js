// Al presionar Enter en un input/select, en vez de no hacer nada (o
// disparar el submit antes de tiempo, como hacia el lector de codigo de
// barras) pasa el foco al siguiente campo dentro del mismo contenedor -
// mismo recorrido que ya hace Tab. Nunca interviene en <textarea> (Enter
// ahi es un salto de linea) ni en botones (se dejan con su comportamiento
// nativo, para no terminar aterrizando por accidente en un "Cancelar").
// Si no hay un campo siguiente, no se hace preventDefault - dentro de un
// <form> con un solo campo (ej. las busquedas de cliente/producto), esto
// deja que Enter siga enviando el formulario como ya hace hoy.
export function avanzarConEnter(e) {
  if (e.key !== "Enter") return;
  const objetivo = e.target;
  if (objetivo.tagName === "BUTTON" || objetivo.tagName === "TEXTAREA") return;

  const campos = Array.from(e.currentTarget.querySelectorAll("input, select")).filter(
    (el) => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null
  );
  const indice = campos.indexOf(objetivo);
  if (indice === -1) return;
  const siguiente = campos[indice + 1];
  if (!siguiente) return;

  e.preventDefault();
  siguiente.focus();
}
