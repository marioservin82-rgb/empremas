"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const ESTILO = {
  pendiente: "bg-amber-100 text-amber-700",
  enviado: "bg-amber-100 text-amber-700",
  aprobado: "bg-emerald-100 text-emerald-700",
  rechazado: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};
const ETIQUETA = {
  pendiente: "Enviando…",
  enviado: "En trámite",
  aprobado: "Aprobada",
  rechazado: "Rechazada",
  error: "Error de envío",
};

export default function Remisiones() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/remisiones").then(setItems).catch((e) => setError(e.message));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/configuracion/sifen" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Notas de Remisión</h1>
          <p className="text-sm text-slate-500">Traslado de mercadería. Podés facturar después.</p>
        </div>

        <div className="mb-4 flex gap-2">
          <Link
            href="/documentos/remision/nueva"
            className="flex-1 rounded-xl bg-brand py-3 text-center font-semibold text-white hover:bg-brand-light"
          >
            + Nueva remisión
          </Link>
          <Link
            href="/configuracion/remision"
            className="rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200"
          >
            Transporte
          </Link>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!items ? (
          <p className="text-slate-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500">Todavía no emitiste ninguna remisión.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((r) => (
              <Link
                key={r.id}
                href={`/documentos/remision/${r.id}`}
                className="block rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {r.numero_formateado || "Sin número"}
                      {r.facturada && <span className="ml-2 text-xs font-semibold text-emerald-600">FACTURADA</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {r.cliente_nombre || "Consumidor Final"} · {new Date(r.creado_en).toLocaleDateString("es-PY")}
                    </p>
                    {(r.estado === "rechazado" || r.estado === "error") && r.mensaje_error && (
                      <p className="mt-1 text-xs text-red-500">{r.mensaje_error}</p>
                    )}
                    {!r.facturada && !r.factura_cdc && r.estado === "aprobado" && (
                      <p className="mt-1 text-xs text-amber-600">Pendiente de facturar</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      ESTILO[r.estado] || "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {ETIQUETA[r.estado] || r.estado}
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
