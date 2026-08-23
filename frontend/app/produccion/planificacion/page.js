"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function PlanificacionProduccion() {
  const router = useRouter();
  const [planificacion, setPlanificacion] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [lineaId, setLineaId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    return apiFetch("/api/produccion/planificacion").then(setPlanificacion);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((err) => setError(err.message));
    apiFetch("/api/produccion/lineas")
      .then((r) => setLineas(r.filter((l) => l.activa)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function crear(e) {
    e.preventDefault();
    setError("");
    if (!lineaId || !(Number(cantidad) > 0)) {
      setError("Elegí una línea y una cantidad mayor a 0");
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/api/produccion/planificacion", {
        method: "POST",
        body: JSON.stringify({
          lineaProduccionId: lineaId,
          cantidadPlanificada: Number(cantidad),
          fechaAproximada: fecha || undefined,
        }),
      });
      setLineaId("");
      setCantidad("");
      setFecha("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    try {
      await apiFetch(`/api/produccion/planificacion/${id}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/produccion" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Producción planificada</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lo que planeás producir próximamente — se usa para anticipar la lista de pedido a tus proveedores de
            insumos. No descuenta stock ni afecta nada hasta que cargues la orden real.
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form onSubmit={crear} className="mb-6 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Línea de producción</label>
          <select value={lineaId} onChange={(e) => setLineaId(e.target.value)} className={campo}>
            <option value="">Elegí una línea</option>
            {lineas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>

          <label className={etiqueta}>Cantidad planificada</label>
          <input type="number" min="0.001" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={campo} />

          <label className={etiqueta}>Fecha aproximada (opcional)</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Agregar planificación"}
          </button>
        </form>

        {planificacion === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : planificacion.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
            No hay producción planificada cargada.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {planificacion.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div>
                  <p className="font-bold text-slate-800">{p.linea_nombre}</p>
                  <p className="text-sm text-slate-400">
                    {p.cantidad_planificada}
                    {p.fecha_aproximada && ` · ${new Date(p.fecha_aproximada).toLocaleDateString("es-PY")}`}
                  </p>
                </div>
                <button onClick={() => eliminar(p.id)} className="text-red-500 hover:text-red-700">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
