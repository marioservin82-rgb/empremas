// Convierte un PDF (ej. el KuDE oficial de SIFEN) en una imagen PNG y la
// descarga - para compartirlo facil por celular. Corre todo en el
// navegador: pdfjs-dist se importa recien al llamar, asi no pesa en la
// carga normal de la pantalla. Todas las paginas se apilan en una sola
// imagen larga (mas facil de compartir que varias).
export async function pdfAImagen(urlPdf, nombreArchivo) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const pdf = await pdfjs.getDocument({ url: urlPdf }).promise;
  const escala = 2;

  const paginas = [];
  let alto = 0;
  let ancho = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const viewport = pagina.getViewport({ scale: escala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await pagina.render({ canvas, viewport }).promise;
    paginas.push(canvas);
    alto += canvas.height;
    ancho = Math.max(ancho, canvas.width);
  }

  const final = document.createElement("canvas");
  final.width = ancho;
  final.height = alto;
  const ctx = final.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  let y = 0;
  for (const canvas of paginas) {
    ctx.drawImage(canvas, 0, y);
    y += canvas.height;
  }

  const blob = await new Promise((resolve) => final.toBlob(resolve, "image/png"));
  const enlace = document.createElement("a");
  enlace.download = nombreArchivo;
  enlace.href = URL.createObjectURL(blob);
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
}
