"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

function fecha(f) {
  return new Date(f).toLocaleDateString("es-PY");
}

export default function ReporteSaldos() {
  const router = useRouter();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/reporte-saldos")
      .then(setDatos)
      .catch((err) => setError(err.message));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6 print:hidden">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Cuentas por cobrar y pagar</h1>
          </div>
          {datos && (
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              Imprimir
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!datos ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="reporte-imprimible rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <style>{"@page { size: A4; margin: 15mm; }"}</style>
            <div className="mb-4 hidden print:block">
              <p className="text-xl font-bold">Cuentas por cobrar y pagar</p>
              <p className="text-sm text-slate-500">Emitido el {fecha(datos.generadoEn)}</p>
            </div>
            <p className="mb-4 text-sm font-medium text-slate-500 print:hidden">
              A hoy, {fecha(datos.generadoEn)}
            </p>

            <div className="mb-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-400">Por cobrar</p>
                <p className="text-xl font-extrabold text-ink">Gs {formatoGs.format(datos.totalPorCobrar)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-400">Por pagar</p>
                <p className="text-xl font-extrabold text-ink">Gs {formatoGs.format(datos.totalPorPagar)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-400">Posición neta</p>
                <p className="text-xl font-extrabold text-ink">
                  Gs {formatoGs.format(datos.totalPorCobrar - datos.totalPorPagar)}
                </p>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="mb-3 font-semibold text-slate-700">Cuentas por cobrar (clientes)</h2>
              {datos.clientes.length === 0 ? (
                <p className="text-sm text-slate-400">No hay cuentas por cobrar pendientes.</p>
              ) : (
                <>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        <th className="py-2 pr-2 font-medium">Cliente</th>
                        <th className="py-2 pr-2 font-medium">Documento</th>
                        <th className="py-2 pr-2 text-right font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.clientes.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-2 font-medium text-slate-800">{c.nombre}</td>
                          <td className="py-2 pr-2 text-slate-500">{c.documento || "—"}</td>
                          <td className="py-2 pr-2 text-right font-semibold text-slate-800">
                            Gs {formatoGs.format(c.saldo)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                    <span>Total por cobrar</span>
                    <span>Gs {formatoGs.format(datos.totalPorCobrar)}</span>
                  </div>
                </>
              )}
            </div>

            <div>
              <h2 className="mb-3 font-semibold text-slate-700">Cuentas por pagar (proveedores)</h2>
              {datos.proveedores.length === 0 ? (
                <p className="text-sm text-slate-400">No hay cuentas por pagar pendientes.</p>
              ) : (
                <>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        <th className="py-2 pr-2 font-medium">Proveedor</th>
                        <th className="py-2 pr-2 font-medium">Documento</th>
                        <th className="py-2 pr-2 text-right font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.proveedores.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-2 font-medium text-slate-800">{p.nombre}</td>
                          <td className="py-2 pr-2 text-slate-500">{p.documento || "—"}</td>
                          <td className="py-2 pr-2 text-right font-semibold text-slate-800">
                            Gs {formatoGs.format(p.saldo)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                    <span>Total por pagar</span>
                    <span>Gs {formatoGs.format(datos.totalPorPagar)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
