"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function EditarProducto() {
  const router = useRouter();
  const { id } = useParams();

  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch(`/api/productos/${id}`)
      .then((p) =>
        setForm({
          nombre: p.nombre,
          codigoBarras: p.codigo_barras || "",
          unidadMedida: p.unidad_medida,
          precioCosto: p.precio_costo ?? "",
          precioContado: p.precio_contado,
          precioCredito: p.precio_credito,
          precioMayorista: p.precio_mayorista,
          tasaIva: p.tasa_iva,
          stock: p.stock,
          stockMinimo: p.stock_minimo ?? "",
        })
      )
      .catch((err) => setError(err.message));
  }, [id, router]);

  function actualizar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await apiFetch(`/api/productos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          tasaIva: Number(form.tasaIva),
          precioCosto: form.precioCosto === "" ? undefined : Number(form.precioCosto),
          precioContado: Number(form.precioContado),
          precioCredito: Number(form.precioCredito),
          precioMayorista: Number(form.precioMayorista),
          stockMinimo: form.stockMinimo === "" ? undefined : Number(form.stockMinimo),
        }),
      });
      router.push("/stock");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  if (error && !form) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-blue-900">Editar producto</h1>
        </div>

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Nombre</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} />

          <label className={etiqueta}>Código de barras</label>
          <input value={form.codigoBarras} onChange={actualizar("codigoBarras")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Unidad de medida</label>
          <input value={form.unidadMedida} onChange={actualizar("unidadMedida")} className={campo} />

          <label className={etiqueta}>Precio de costo (Gs, lo que pagaste)</label>
          <input type="number" min="0" value={form.precioCosto} onChange={actualizar("precioCosto")} className={campo} />

          <label className={etiqueta}>Precio contado (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioContado} onChange={actualizar("precioContado")} className={campo} />

          <label className={etiqueta}>Precio crédito (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioCredito} onChange={actualizar("precioCredito")} className={campo} />

          <label className={etiqueta}>Precio mayorista (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioMayorista} onChange={actualizar("precioMayorista")} className={campo} />

          <label className={etiqueta}>Tasa de IVA</label>
          <select value={form.tasaIva} onChange={actualizar("tasaIva")} className={campo}>
            <option value={10}>10%</option>
            <option value={5}>5%</option>
            <option value={0}>Exento (0%)</option>
          </select>

          <label className={etiqueta}>Stock actual</label>
          <div className="mb-1 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg">
            <span className="font-semibold text-slate-700">{form.stock}</span>
            <Link href="/stock/inventario/ajuste" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
              Ajustar
            </Link>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            El stock se corrige desde Ajuste de inventario, para dejar registrado el motivo.
          </p>

          <label className={etiqueta}>Stock mínimo (alerta de reposición)</label>
          <input type="number" min="0" step="0.001" value={form.stockMinimo} onChange={actualizar("stockMinimo")} className={campo} placeholder="Opcional" />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-blue-700 py-3 text-lg font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </div>
    </main>
  );
}
