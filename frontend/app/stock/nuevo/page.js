"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { avanzarConEnter } from "@/lib/avanzarConEnter";

const vacio = {
  nombre: "",
  codigoBarras: "",
  unidadMedida: "unidad",
  precioCosto: "",
  precioContado: "",
  precioCredito: "",
  precioMayorista: "",
  tasaIva: 10,
  stock: "",
};

export default function NuevoProducto() {
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
    if (!(Number(form.precioContado) > 0)) {
      setError("El precio contado (precio de venta) es obligatorio y debe ser mayor a 0");
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/api/productos", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          tasaIva: Number(form.tasaIva),
          precioCosto: Number(form.precioCosto) || 0,
          precioContado: Number(form.precioContado) || 0,
          precioCredito: Number(form.precioCredito) || 0,
          precioMayorista: Number(form.precioMayorista) || 0,
          stock: Number(form.stock) || 0,
        }),
      });
      router.push("/stock");
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
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Nuevo producto</h1>
        </div>

        <form onSubmit={enviar} onKeyDown={avanzarConEnter} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Nombre</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Tornillo autoperforante 2 pulg" />

          <label className={etiqueta}>Código de barras</label>
          <input
            value={form.codigoBarras}
            onChange={actualizar("codigoBarras")}
            className={campo}
            placeholder="Opcional (podés escanear acá)"
          />

          <label className={etiqueta}>Unidad de medida</label>
          <input value={form.unidadMedida} onChange={actualizar("unidadMedida")} className={campo} placeholder="unidad, kilo, metro, caja..." />

          <label className={etiqueta}>Precio de costo (Gs, lo que pagaste)</label>
          <input type="number" min="0" value={form.precioCosto} onChange={actualizar("precioCosto")} className={campo} placeholder="0" />

          <label className={etiqueta}>Precio contado (Gs, IVA incluido)</label>
          <input
            required
            name="precioContado"
            type="number"
            min="1"
            value={form.precioContado}
            onChange={actualizar("precioContado")}
            className={campo}
            placeholder="0"
          />

          <label className={etiqueta}>Precio crédito (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioCredito} onChange={actualizar("precioCredito")} className={campo} placeholder="0" />

          <label className={etiqueta}>Precio mayorista (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioMayorista} onChange={actualizar("precioMayorista")} className={campo} placeholder="0" />

          <label className={etiqueta}>Tasa de IVA</label>
          <select value={form.tasaIva} onChange={actualizar("tasaIva")} className={campo}>
            <option value={10}>10%</option>
            <option value={5}>5%</option>
            <option value={0}>Exento (0%)</option>
          </select>

          <label className={etiqueta}>Stock inicial</label>
          <input type="number" min="0" step="0.001" value={form.stock} onChange={actualizar("stock")} className={campo} placeholder="0" />

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar producto"}
          </button>
        </form>
      </div>
    </main>
  );
}
