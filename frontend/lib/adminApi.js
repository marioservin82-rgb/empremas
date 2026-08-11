const BASE_URL = "http://localhost:3001";

// Mismo patron que lib/api.js, pero con su propia clave de localStorage
// (empremas_admin_token, nunca empremas_token) - asi una sesion de tenant
// y una del panel de admin conviven en el mismo navegador sin pisarse.
export async function adminFetch(ruta, opciones = {}) {
  const token = localStorage.getItem("empremas_admin_token");
  const resp = await fetch(`${BASE_URL}${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error || "Ocurrió un error");
  return datos;
}
