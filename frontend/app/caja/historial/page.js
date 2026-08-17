"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

function fechaHora(f) {
  const d = new Date(f);
  return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY")}`;
}

export default function HistorialTurnos() {
  const router = useRouter();
  const [turnos, setTurnos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/turnos")
      .then(setTurnos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/caja" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Historial de turnos</h1>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : turnos.length === 0 ? (
          <p className="text-slate-500">No hay turnos todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {turnos.map((t) => (
              <div key={t.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-800">{t.usuario_nombre}</p>
                    <p className="text-sm text-slate-400">
                      {t.sucursal_nombre && <>{t.sucursal_nombre} · </>}
                      Abrió {fechaHora(t.abierto_en)}
                      {t.cerrado_en && <> · Cerró {fechaHora(t.cerrado_en)}</>}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      t.estado === "abierto" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t.estado === "abierto" ? "Abierto" : "Cerrado"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-400">Inicial</p>
                    <p className="font-semibold text-slate-700">Gs {formatoGs.format(t.monto_inicial)}</p>
                  </div>
                  {Number(t.total_retiros) > 0 && (
                    <div>
                      <p className="text-xs text-slate-400">Retiros</p>
                      <p className="font-semibold text-slate-700">− Gs {formatoGs.format(t.total_retiros)}</p>
                    </div>
                  )}
                  {t.estado === "cerrado" && (
                    <>
                      <div>
                        <p className="text-xs text-slate-400">Esperado</p>
                        <p className="font-semibold text-slate-700">Gs {formatoGs.format(t.efectivo_esperado)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Declarado</p>
                        <p className="font-semibold text-slate-700">Gs {formatoGs.format(t.monto_declarado_cierre)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Diferencia</p>
                        <p
                          className={`font-semibold ${
                            Number(t.diferencia) === 0
                              ? "text-slate-700"
                              : Number(t.diferencia) > 0
                                ? "text-emerald-600"
                                : "text-red-600"
                          }`}
                        >
                          Gs {formatoGs.format(t.diferencia)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
