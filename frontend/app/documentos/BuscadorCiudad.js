"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const campo =
  "mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

// Buscador del catálogo geográfico de SIFEN (ciudad → código).
// `valor` es { codigo, ciudad, distrito, departamento } | null.
export default function BuscadorCiudad({ valor, onSelect, placeholder }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const qDeb = useDebounced(q);

  useEffect(() => {
    if (!qDeb || qDeb.length < 2) return setResultados([]);
    apiFetch(`/api/autofacturas/ciudades?q=${encodeURIComponent(qDeb)}`)
      .then((r) => setResultados(r.ciudades || []))
      .catch(() => setResultados([]));
  }, [qDeb]);

  if (valor) {
    return (
      <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">
          {valor.ciudad}{" "}
          <span className="font-normal text-slate-400">
            · {valor.distrito}, {valor.departamento}
          </span>
        </span>
        <button type="button" onClick={() => onSelect(null)} className="text-sm text-red-500">
          cambiar
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={campo}
        placeholder={placeholder || "Buscar ciudad"}
      />
      {resultados.length > 0 && (
        <div className="mb-3 flex max-h-52 flex-col gap-1 overflow-y-auto">
          {resultados.map((c) => (
            <button
              key={c.codigo}
              type="button"
              onClick={() => {
                onSelect(c);
                setQ("");
                setResultados([]);
              }}
              className="rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              {c.ciudad}{" "}
              <span className="text-slate-400">
                · {c.distrito}, {c.departamento}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
