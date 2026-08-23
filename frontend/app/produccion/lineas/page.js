"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const vacio = { nombre: "", cantidadReferencia: "1", unidadReferencia: "unidad" };

export default function LineasProduccion() {
  const router = useRouter();
  const [lineas, setLineas] = useState(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    return apiFetch("/api/produccion/lineas").then(setLineas);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function crear(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await apiFetch("/api/produccion/lineas", {
        method: "POST",
        body: JSON.stringify({
          nombre: form.nombre,
          cantidadReferencia: Number(form.cantidadReferencia) || 1,
          unidadReferencia: form.unidadReferencia,
        }),
      });
      setForm(vacio);
      setCreando(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/produccion" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Líneas de producción</h1>
          </div>
          <button
            onClick={() => setCreando(true)}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nueva línea
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {creando && (
          <form onSubmit={crear} className="mb-6 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-navy">Nueva línea de producción</h2>
            <label className={etiqueta}>Nombre</label>
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className={campo}
              placeholder="Ej: Ladrillos"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={etiqueta}>Cantidad de referencia</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.cantidadReferencia}
                  onChange={(e) => setForm({ ...form, cantidadReferencia: e.target.value })}
                  className={campo}
                />
              </div>
              <div>
                <label className={etiqueta}>Unidad</label>
                <input
                  value={form.unidadReferencia}
                  onChange={(e) => setForm({ ...form, unidadReferencia: e.target.value })}
                  className={campo}
                  placeholder="unidad, lote..."
                />
              </div>
            </div>
            <p className="-mt-3 mb-4 text-xs text-slate-400">
              Ej: si tu receta rinde "1 lote de 1000 ladrillos", cargá 1000 como cantidad de referencia.
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
              >
                {guardando ? "Creando..." : "Crear línea"}
              </button>
              <button
                type="button"
                onClick={() => setCreando(false)}
                className="rounded-xl bg-slate-100 px-6 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {lineas === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : lineas.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
            Todavía no hay líneas de producción cargadas.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {lineas.map((l) => (
              <Link
                key={l.id}
                href={`/produccion/lineas/${l.id}`}
                className="rounded-2xl bg-white p-5 shadow shadow-slate-200 transition hover:shadow-md"
              >
                <p className="text-lg font-bold text-slate-800">
                  {l.nombre} {!l.activa && <span className="text-sm font-normal text-slate-400">(inactiva)</span>}
                </p>
                <p className="text-sm text-slate-400">
                  Receta de referencia: {l.cantidad_referencia} {l.unidad_referencia}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
