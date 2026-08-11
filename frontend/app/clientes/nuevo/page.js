"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const vacio = {
  nombre: "",
  documento: "",
  telefono: "",
  celular: "",
  email: "",
  direccion: "",
  lineaCredito: "",
};

export default function NuevoCliente() {
  const router = useRouter();
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function actualizar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await apiFetch("/api/clientes", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          lineaCredito: Number(form.lineaCredito) || 0,
        }),
      });
      router.push("/clientes");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-blue-900">Nuevo cliente</h1>
        </div>

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Cédula o RUC</label>
          <input value={form.documento} onChange={actualizar("documento")} className={campo} placeholder="Opcional" autoFocus />
          <p className="-mt-3 mb-4 text-xs text-slate-400">
            Cuando esté conectado con el SIFEN, este número va a completar el resto de los datos automáticamente.
          </p>

          <label className={etiqueta}>Nombre y apellido</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Juan Pérez" />

          <label className={etiqueta}>Teléfono</label>
          <input value={form.telefono} onChange={actualizar("telefono")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Celular</label>
          <input value={form.celular} onChange={actualizar("celular")} className={campo} placeholder="Opcional, para WhatsApp" />

          <label className={etiqueta}>Email</label>
          <input type="email" value={form.email} onChange={actualizar("email")} className={campo} placeholder="Opcional, para mandarle la factura" />

          <label className={etiqueta}>Dirección</label>
          <input value={form.direccion} onChange={actualizar("direccion")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Línea de crédito (Gs)</label>
          <input type="number" min="0" value={form.lineaCredito} onChange={actualizar("lineaCredito")} className={campo} placeholder="0" />

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-amber-600 py-3 text-lg font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar cliente"}
          </button>
        </form>
      </div>
    </main>
  );
}
