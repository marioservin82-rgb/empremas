"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Acceso rapido a Vender desde cualquier pantalla del sistema (ej. a mitad
// de cargar una compra, llega un cliente) - abre en pestaña nueva a
// proposito, no navega en la misma: asi lo que se estaba cargando en la
// pantalla original queda intacto, y al volver a esa pestaña se sigue
// exactamente donde se habia dejado, sin guardar borradores ni nada.
const RUTAS_OCULTAS = ["/", "/registro", "/vender"];

export default function BotonVenderRapido() {
  const pathname = usePathname();
  const [logueado, setLogueado] = useState(false);

  useEffect(() => {
    setLogueado(!!localStorage.getItem("empremas_token"));
  }, [pathname]);

  if (!logueado) return null;
  if (pathname?.startsWith("/admin")) return null;
  if (RUTAS_OCULTAS.includes(pathname)) return null;

  return (
    <a
      href="/vender"
      target="_blank"
      rel="noopener noreferrer"
      title="Vender (se abre en una pestaña nueva, sin perder lo que estás haciendo acá)"
      className="fixed bottom-24 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-3xl text-white shadow-lg transition hover:bg-brand-light"
    >
      🛒
    </a>
  );
}
