"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");
const ESTILO = {
  pendiente: "bg-amber-100 text-amber-700",
  enviado: "bg-amber-100 text-amber-700",
  aprobado: "bg-emerald-100 text-emerald-700",
  rechazado: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};
const ETIQUETA = { pendiente: "Enviando…", enviado: "En trámite", aprobado: "Aprobada", rechazado: "Rechazada", error: "Error de envío" };

export default function Notas() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/notas").then(setItems).catch((e) => setError(e.message));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/configuracion/sifen" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Notas de Crédito / Débito</h1>
          <p className="text-sm text-slate-500">Se emiten desde una factura, en el detalle de la venta.</p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!items ? (
          <p className="text-slate-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500">Todavía no emitiste ninguna nota.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((n) => (
              <Link
                key={n.id}
                href={`/documentos/notas/${n.id}`}
                className="block rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {n.tipo === "credito" ? "Nota de Crédito" : "Nota de Débito"} {n.numero_formateado || ""}
                    </p>
                    <p className="text-sm text-slate-400">
                      {n.cliente_nombre || "Consumidor Final"} · {new Date(n.creado_en).toLocaleDateString("es-PY")}
                    </p>
                    {(n.estado === "rechazado" || n.estado === "error") && n.mensaje_error && (
                      <p className="mt-1 text-xs text-red-500">{n.mensaje_error}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-navy">Gs {formatoGs.format(n.total)}</p>
                    <span
                      className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                        ESTILO[n.estado] || "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {ETIQUETA[n.estado] || n.estado}
                    </span>
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
