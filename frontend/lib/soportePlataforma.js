const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Numero de soporte de la PLATAFORMA EMPREMAS (no del negocio tenant) -
// mismo endpoint publico, sin auth, que ya usa BotonSoporteWhatsapp. Lo
// usan ademas los documentos que llevan el pie publicitario "Generado por
// EMPREMAS" (ver lib/piePublicidadEmpremas.js).
export async function obtenerNumeroSoportePlataforma() {
  try {
    const r = await fetch(`${BASE_URL}/api/configuracion/soporte`);
    const d = await r.json();
    return d.whatsappSoporte || null;
  } catch {
    return null;
  }
}
