"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { nombresEmpresa } from "@/lib/encabezadoEmpresa";
import PiePublicidadEmpremas from "@/components/PiePublicidadEmpremas";

const formatoGs = new Intl.NumberFormat("es-PY");

function fecha(f) {
  return new Date(f).toLocaleDateString("es-PY");
}

export default function ResumenCuentasPorCobrar() {
  const router = useRouter();
  const recuadroRef = useRef(null);
  const [datos, setDatos] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/reporte-saldos").then(setDatos).catch((err) => setError(err.message));
    apiFetch("/api/empresas/actual").then(setEmpresa).catch(() => {});
  }, [router]);

  async function descargarImagen() {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const enlace = document.createElement("a");
    enlace.download = "resumen-cuentas-por-cobrar.png";
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6 print:hidden">
          <div>
            <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Resumen de cuentas por cobrar</h1>
          </div>
          {datos && (
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
              >
                Imprimir
              </button>
              <button
                onClick={descargarImagen}
                className="rounded-xl bg-navy px-5 py-3 font-semibold text-white hover:bg-navy-2"
              >
                Descargar imagen
              </button>
            </div>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!datos ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div ref={recuadroRef} className="reporte-imprimible rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <style>{"@page { size: A4; margin: 15mm; }"}</style>
            <div className="mb-4">
              {empresa && (
                <>
                  <p className="text-lg font-bold">{nombresEmpresa(empresa).principal}</p>
                  {nombresEmpresa(empresa).secundario && (
                    <p className="text-sm text-slate-500">{nombresEmpresa(empresa).secundario}</p>
                  )}
                  <p className="text-sm text-slate-500">RUC {empresa.ruc}</p>
                </>
              )}
              <p className="mt-2 text-xl font-bold">Resumen de cuentas por cobrar</p>
              <p className="text-sm text-slate-500">Emitido el {fecha(datos.generadoEn)}</p>
            </div>

            <div className="mb-6 rounded-2xl bg-slate-50 p-5 text-center">
              <p className="text-sm text-slate-400">Total por cobrar</p>
              <p className="text-3xl font-extrabold text-ink">Gs {formatoGs.format(datos.totalPorCobrar)}</p>
            </div>

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

            <PiePublicidadEmpremas />
          </div>
        )}
      </div>
    </main>
  );
}
