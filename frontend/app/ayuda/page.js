"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { linkWhatsapp } from "@/lib/whatsapp";

export default function Ayuda() {
  const router = useRouter();
  const [numero, setNumero] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${BASE_URL}/api/configuracion/soporte`)
      .then((r) => r.json())
      .then((d) => setNumero(d.whatsappSoporte))
      .finally(() => setCargando(false));
  }, [router]);

  const link = numero ? linkWhatsapp(numero, "Hola, necesito ayuda con EMPREMAS") : null;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-sm">
        <div className="py-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Ayuda / Soporte</h1>
          <p className="mt-1 text-sm text-slate-500">
            Esto es soporte de EMPREMAS (la plataforma) — no la configuración de tu negocio.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 text-center shadow shadow-slate-200">
          {cargando ? (
            <p className="text-slate-500">Cargando...</p>
          ) : link ? (
            <>
              <p className="mb-4 text-slate-600">¿Tenés un problema con el sistema? Escribinos por WhatsApp.</p>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-full rounded-xl bg-emerald-600 py-3 text-lg font-semibold text-white transition hover:bg-brand"
              >
                💬 Escribir a soporte
              </a>
            </>
          ) : (
            <p className="text-slate-500">Todavía no hay un canal de soporte configurado.</p>
          )}
        </div>
      </div>
    </main>
  );
}
