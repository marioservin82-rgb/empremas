// Redimensiona/convierte el logo de la empresa (cualquier formato o
// tamaño que haya subido el dueño desde Mi Empresa) a un PNG chico apto
// para el ticket termico. El agente de impresion (agente-impresion/src/
// imagenEscpos.js) solo sabe leer PNG y usa el ancho de la imagen tal
// cual, sin acotarlo al ancho real del papel - un logo grande o en JPEG
// mandado tal cual puede romper la impresion o salir gigante. La version
// en pantalla/A4/imagen descargada NO pasa por aca (el navegador ya
// escala un <img> solo).
export function logoParaTicket(dataUrlLogo, anchoMaximo = 300) {
  return new Promise((resolve) => {
    if (!dataUrlLogo) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, anchoMaximo / img.width);
      const ancho = Math.max(1, Math.round(img.width * escala));
      const alto = Math.max(1, Math.round(img.height * escala));
      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      // Fondo blanco explicito: un logo con transparencia igual se veria
      // "sin punto" (blanco) en el termico - pintarlo aca de una vez
      // evita sorpresas y sirve tambien si el logo original es JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(img, 0, 0, ancho, alto);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrlLogo;
  });
}
