const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function apiFetch(ruta, opciones = {}) {
  const token = localStorage.getItem("empremas_token");
  // Acceso transversal del dueño: si eligió "trabajar" en otra sucursal
  // desde el panel (ver SelectorSucursal), esta elección viaja en cada
  // pedido y el backend la valida (solo pisa la sucursal fija del token
  // si el rol es dueño y la sucursal es de su propia empresa - ver
  // middleware/autenticar.js). Para cualquier otro rol, no hace nada.
  const sucursalActiva = localStorage.getItem("empremas_sucursal_activa");
  const resp = await fetch(`${BASE_URL}${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sucursalActiva ? { "X-Sucursal-Activa": sucursalActiva } : {}),
      ...opciones.headers,
    },
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error || "Ocurrió un error");
  return datos;
}
