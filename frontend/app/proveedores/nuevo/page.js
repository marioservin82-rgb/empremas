"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { avanzarConEnter } from "@/lib/avanzarConEnter";

const vacio = { nombre: "", documento: "", telefono: "", email: "", direccion: "", saldoInicial: "" };

export default function NuevoProveedor() {
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
      await apiFetch("/api/proveedores", {
        method: "POST",
        body: JSON.stringify({ ...form, saldoInicial: Number(form.saldoInicial) || 0 }),
      });
      router.push("/proveedores");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/proveedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Nuevo proveedor</h1>
        </div>

        <form onSubmit={enviar} onKeyDown={avanzarConEnter} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>RUC</label>
          <input value={form.documento} onChange={actualizar("documento")} className={campo} placeholder="Opcional" autoFocus />

          <label className={etiqueta}>Nombre / Razón social</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Ferretería Mayorista SA" />

          <label className={etiqueta}>Teléfono</label>
          <input value={form.telefono} onChange={actualizar("telefono")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Email</label>
          <input type="email" value={form.email} onChange={actualizar("email")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Dirección</label>
          <input value={form.direccion} onChange={actualizar("direccion")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Saldo inicial (Gs)</label>
          <input type="number" min="0" value={form.saldoInicial} onChange={actualizar("saldoInicial")} className={campo} placeholder="0" />
          <p className="-mt-3 mb-4 text-xs text-slate-400">Si ya le debías algo antes de pasarte a EMPREMAS, cargalo acá.</p>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar proveedor"}
          </button>
        </form>
      </div>
    </main>
  );
}
