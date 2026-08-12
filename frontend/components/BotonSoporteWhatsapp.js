"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { linkWhatsapp } from "@/lib/whatsapp";

// Icono flotante de soporte de EMPREMAS (la plataforma, no el comercio
// cliente) - visible en el login y en todo el panel de cada tenant, pero
// nunca en /admin (el super-admin no necesita contactarse a si mismo).
export default function BotonSoporteWhatsapp() {
  const pathname = usePathname();
  const [numero, setNumero] = useState(null);

  useEffect(() => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${BASE_URL}/api/configuracion/soporte`)
      .then((r) => r.json())
      .then((d) => setNumero(d.whatsappSoporte))
      .catch(() => {});
  }, []);

  if (pathname?.startsWith("/admin") || !numero) return null;

  const link = linkWhatsapp(numero, "Hola, necesito ayuda con EMPREMAS");
  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title="Soporte EMPREMAS por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-3xl text-white shadow-lg transition hover:bg-emerald-600"
    >
      💬
    </a>
  );
}
