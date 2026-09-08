"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const ESTILO_ESTADO = {
  recibido: "bg-amber-100 text-amber-700",
  en_reparacion: "bg-navy/10 text-navy",
  listo_para_entrega: "bg-emerald-100 text-emerald-700",
  entregado: "bg-slate-100 text-slate-500",
  cancelado: "bg-red-100 text-red-700",
};
const ETIQUETA_ESTADO = {
  recibido: "Recibido",
  en_reparacion: "En reparación",
  listo_para_entrega: "Listo para entrega",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
const FILTROS = [
  { valor: "", etiqueta: "Todas" },
  { valor: "recibido", etiqueta: "Recibido" },
  { valor: "en_reparacion", etiqueta: "En reparación" },
  { valor: "listo_para_entrega", etiqueta: "Listo" },
  { valor: "entregado", etiqueta: "Entregado" },
];

function fechaHora(f) {
  return new Date(f).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Reparaciones() {
  const router = useRouter();
  const [estado, setEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [reparaciones, setReparaciones] = useState(null);
  const [error, setError] = useState("");

  async function cargar(est, q) {
    setError("");
    try {
      const query = new URLSearchParams();
      if (est) query.set("estado", est);
      if (q) query.set("q", q);
      const qs = query.toString();
      setReparaciones(await apiFetch(`/api/reparaciones${qs ? `?${qs}` : ""}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar("", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    cargar(estado, busquedaDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced]);

  function cambiarEstado(valor) {
    setEstado(valor);
    cargar(valor, busqueda);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Nota de Recepción</h1>
          </div>
          <Link
            href="/reparaciones/nueva"
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nueva recepción
          </Link>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                onClick={() => cambiarEstado(f.valor)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  estado === f.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o número de recepción..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {reparaciones === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : reparaciones.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-slate-500 shadow shadow-slate-200">
            Sin recepciones para este filtro.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {reparaciones.map((r) => (
              <Link
                key={r.id}
                href={`/reparaciones/${r.id}`}
                className="block rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      N° {r.numero} · {r.tipo_equipo}
                      {r.marca ? ` ${r.marca}` : ""}
                      {r.modelo ? ` ${r.modelo}` : ""}
                    </p>
                    <p className="text-sm text-slate-400">
                      {r.cliente_nombre} · {fechaHora(r.creado_en)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${ESTILO_ESTADO[r.estado]}`}>
                    {ETIQUETA_ESTADO[r.estado]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
