"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { linkWhatsapp } from "@/lib/whatsapp";

export default function RecuperarContrasena() {
  const [numeroSoporte, setNumeroSoporte] = useState(null);
  const [dato, setDato] = useState("");

  useEffect(() => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${BASE_URL}/api/configuracion/soporte`)
      .then((r) => r.json())
      .then((d) => setNumeroSoporte(d.whatsappSoporte))
      .catch(() => {});
  }, []);

  // Hoy no hay forma de mandar un codigo automatico por email/WhatsApp
  // (no hay proveedor de mensajeria conectado) - el dueño contacta a
  // soporte con sus datos, y un admin de la plataforma verifica quien es
  // y le genera una contraseña temporal desde su panel.
  const mensaje = dato.trim()
    ? `Hola, soy el dueño de una empresa en EMPREMAS y olvidé mi contraseña. Mi email o teléfono registrado es: ${dato.trim()}`
    : "Hola, soy el dueño de una empresa en EMPREMAS y olvidé mi contraseña.";
  const link = numeroSoporte ? linkWhatsapp(numeroSoporte, mensaje) : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-navy">Recuperar contraseña</h1>
          <p className="mt-2 text-slate-500">Solo el dueño de la empresa puede recuperar el acceso.</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <p className="mb-4 text-sm text-slate-600">
            Por ahora esto lo resuelve una persona de EMPREMAS, no un código automático. Contanos tu email o
            teléfono registrado y te vamos a pedir una contraseña nueva por WhatsApp, apenas confirmemos que sos
            vos.
          </p>

          <label className="mb-1 block text-sm font-medium text-slate-700">Email o teléfono con el que te registraste</label>
          <input
            value={dato}
            onChange={(e) => setDato(e.target.value)}
            placeholder="tu@email.com o tu teléfono"
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-xl bg-emerald-600 py-3 text-center text-lg font-semibold text-white transition hover:bg-emerald-700"
            >
              Contactar por WhatsApp
            </a>
          ) : (
            <p className="text-sm text-slate-400">Cargando el contacto de soporte...</p>
          )}
        </div>

        <p className="mt-6 text-center">
          <Link href="/" className="text-sm font-medium text-navy hover:text-brand">
            ← Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
