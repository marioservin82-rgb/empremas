"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function OrdenesProduccion() {
  const router = useRouter();
  const [ordenes, setOrdenes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/produccion/ordenes")
      .then(setOrdenes)
      .catch((err) => setError(err.message));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/produccion" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Órdenes de producción</h1>
          </div>
          <Link
            href="/produccion/ordenes/nueva"
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nueva orden
          </Link>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {ordenes === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : ordenes.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
            Todavía no hay órdenes de producción cargadas.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {ordenes.map((o) => (
              <Link
                key={o.id}
                href={`/produccion/ordenes/${o.id}`}
                className="rounded-2xl bg-white p-5 shadow shadow-slate-200 transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-800">{o.linea_nombre}</p>
                    <p className="text-sm text-slate-400">
                      {new Date(o.fecha).toLocaleDateString("es-PY")} · {o.cantidad_producida} producido
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        o.estado === "cerrada" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {o.estado === "cerrada" ? "Clasificada" : "Sin clasificar"}
                    </span>
                    {o.costo_unitario_calculado != null && (
                      <p className="mt-1 text-sm text-slate-500">
                        Gs {formatoGs.format(o.costo_unitario_calculado)}/unidad
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
