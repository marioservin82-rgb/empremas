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

export default function Autofacturas() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/autofacturas").then(setItems).catch((e) => setError(e.message));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/configuracion/sifen" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Autofacturas</h1>
          <p className="text-sm text-slate-500">
            Documenta una compra a alguien que no es contribuyente (sin RUC).
          </p>
        </div>

        <Link
          href="/documentos/autofactura/nueva"
          className="mb-4 block rounded-xl bg-brand py-3 text-center font-semibold text-white hover:bg-brand-light"
        >
          + Nueva autofactura
        </Link>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!items ? (
          <p className="text-slate-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500">Todavía no emitiste ninguna autofactura.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((a) => (
              <Link
                key={a.id}
                href={`/documentos/autofactura/${a.id}`}
                className="block rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {a.numero_formateado || "Sin número"}
                    </p>
                    <p className="text-sm text-slate-400">
                      {a.vendedor_nombre} · {new Date(a.creado_en).toLocaleDateString("es-PY")}
                    </p>
                    {(a.estado === "rechazado" || a.estado === "error") && a.mensaje_error && (
                      <p className="mt-1 text-xs text-red-500">{a.mensaje_error}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-navy">Gs {formatoGs.format(a.total)}</p>
                    <span
                      className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                        ESTILO[a.estado] || "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {ETIQUETA[a.estado] || a.estado}
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
