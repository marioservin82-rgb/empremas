"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function NuevaOrdenProduccion() {
  const router = useRouter();
  const [lineas, setLineas] = useState([]);
  const [lineaId, setLineaId] = useState("");
  const [cantidadProducida, setCantidadProducida] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/produccion/lineas")
      .then((r) => setLineas(r.filter((l) => l.activa)))
      .catch((err) => setError(err.message));
  }, [router]);

  const linea = lineas.find((l) => l.id === lineaId);

  async function crear(e) {
    e.preventDefault();
    setError("");
    if (!lineaId || !(Number(cantidadProducida) > 0)) {
      setError("Elegí una línea y una cantidad producida mayor a 0");
      return;
    }
    setGuardando(true);
    try {
      const orden = await apiFetch("/api/produccion/ordenes", {
        method: "POST",
        body: JSON.stringify({ lineaProduccionId: lineaId, cantidadProducida: Number(cantidadProducida) }),
      });
      router.push(`/produccion/ordenes/${orden.id}`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/produccion/ordenes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Nueva orden de producción</h1>
          <p className="mt-1 text-sm text-slate-500">
            Al confirmar, se descuentan los insumos según la receta — clasificás por calidad después.
          </p>
        </div>

        <form onSubmit={crear} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Línea de producción</label>
          <select value={lineaId} onChange={(e) => setLineaId(e.target.value)} className={campo} required>
            <option value="">Elegí una línea</option>
            {lineas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>

          <label className={etiqueta}>
            Cantidad producida {linea && `(${linea.unidad_referencia})`}
          </label>
          <input
            type="number"
            min="0.001"
            step="0.001"
            required
            value={cantidadProducida}
            onChange={(e) => setCantidadProducida(e.target.value)}
            className={campo}
            placeholder="0"
          />
          {linea && (
            <p className="-mt-3 mb-4 text-xs text-slate-400">
              Receta de referencia: {linea.cantidad_referencia} {linea.unidad_referencia}
            </p>
          )}

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Descontando insumos..." : "Confirmar orden"}
          </button>
        </form>
      </div>
    </main>
  );
}
