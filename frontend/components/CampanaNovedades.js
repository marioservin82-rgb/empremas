"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const CATEGORIAS = {
  nueva_funcion: { icono: "🆕", etiqueta: "Nueva función", estilo: "bg-brand/10 text-brand" },
  mejora: { icono: "⚡", etiqueta: "Mejora", estilo: "bg-navy/10 text-navy" },
  correccion: { icono: "🔧", etiqueta: "Corrección", estilo: "bg-slate-100 text-slate-600" },
};

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-PY", { day: "numeric", month: "short" });
}

export default function CampanaNovedades() {
  const [novedades, setNovedades] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [expandidaId, setExpandidaId] = useState(null);

  useEffect(() => {
    apiFetch("/api/novedades")
      .then(setNovedades)
      .catch(() => {});
  }, []);

  const noLeidas = novedades.filter((n) => !n.leida).length;

  function alternarNovedad(novedad) {
    const yaAbierta = expandidaId === novedad.id;
    setExpandidaId(yaAbierta ? null : novedad.id);
    if (!yaAbierta && !novedad.leida) {
      setNovedades((actual) => actual.map((n) => (n.id === novedad.id ? { ...n, leida: true } : n)));
      apiFetch(`/api/novedades/${novedad.id}/leer`, { method: "POST" }).catch(() => {});
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="relative text-sm font-medium text-slate-500 hover:text-slate-700"
        aria-label="Novedades"
      >
        🔔
        {noLeidas > 0 && (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl bg-white p-3 shadow-lg shadow-slate-200">
            <p className="mb-2 px-2 text-sm font-bold text-slate-800">Novedades</p>
            {novedades.length === 0 && (
              <p className="px-2 py-3 text-sm text-slate-400">Todavía no hay novedades publicadas.</p>
            )}
            {novedades.map((n) => {
              const cat = CATEGORIAS[n.categoria];
              const expandida = expandidaId === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => alternarNovedad(n)}
                  className="mb-1 block w-full rounded-xl p-2 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cat.estilo}`}>
                      {cat.icono} {cat.etiqueta}
                    </span>
                    <span className="text-[11px] text-slate-400">{formatoFecha(n.creado_en)}</span>
                  </div>
                  <p className={`mt-1 text-sm ${n.leida ? "font-normal text-slate-600" : "font-bold text-slate-800"}`}>
                    {n.titulo}
                  </p>
                  {expandida && <p className="mt-1 text-sm text-slate-500">{n.descripcion}</p>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
