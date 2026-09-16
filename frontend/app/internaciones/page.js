"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const FILTROS = [
  { valor: "", etiqueta: "Todas" },
  { valor: "internado", etiqueta: "Internadas" },
  { valor: "dado_de_alta", etiqueta: "Dadas de alta" },
];

function fechaHora(f) {
  return new Date(f).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Internaciones() {
  const router = useRouter();
  const [estado, setEstado] = useState("internado");
  const [busqueda, setBusqueda] = useState("");
  const [internaciones, setInternaciones] = useState(null);
  const [error, setError] = useState("");

  async function cargar(est, q) {
    setError("");
    try {
      const query = new URLSearchParams();
      if (est) query.set("estado", est);
      if (q) query.set("q", q);
      const qs = query.toString();
      setInternaciones(await apiFetch(`/api/internaciones${qs ? `?${qs}` : ""}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar(estado, "");
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
            <h1 className="text-2xl font-bold text-navy">Internación</h1>
          </div>
          <Link
            href="/internaciones/nueva"
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nuevo ingreso
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
            placeholder="Buscar por mascota o dueño..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {internaciones === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : internaciones.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-slate-500 shadow shadow-slate-200">
            Sin internaciones para este filtro.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {internaciones.map((i) => (
              <Link
                key={i.id}
                href={`/internaciones/${i.id}`}
                className="block rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      N° {i.numero} · {i.mascota_nombre} <span className="text-sm font-normal text-slate-400">({i.mascota_especie})</span>
                    </p>
                    <p className="text-sm text-slate-400">
                      {i.motivo} · {i.cliente_nombre} · Ingresó el {fechaHora(i.fecha_ingreso)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      i.estado === "internado" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {i.estado === "internado" ? "Internado" : "Dado de alta"}
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
