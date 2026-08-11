"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function Presupuestos() {
  const router = useRouter();
  const [presupuestos, setPresupuestos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/presupuestos")
      .then(setPresupuestos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/vender" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver a Vender
            </Link>
            <h1 className="text-2xl font-bold text-blue-900">Presupuestos</h1>
          </div>
          <Link
            href="/presupuestos/nuevo"
            className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
          >
            + Nuevo presupuesto
          </Link>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : presupuestos.length === 0 ? (
          <p className="text-slate-500">No hay presupuestos todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {presupuestos.map((p) => (
              <Link
                key={p.id}
                href={`/presupuestos/${p.id}`}
                className="rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">{p.cliente_nombre || "Sin cliente"}</p>
                    <p className="text-sm text-slate-400">
                      Vence {new Date(p.vencimiento).toLocaleDateString("es-PY")}
                      {p.vencido && <span className="ml-2 font-semibold text-red-500">VENCIDO</span>}
                    </p>
                  </div>
                  <p className="text-2xl font-extrabold text-blue-900">Gs {formatoGs.format(p.total)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
