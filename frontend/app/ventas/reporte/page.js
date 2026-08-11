"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_FORMA_PAGO = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};

function fecha(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function ReporteVentas() {
  const router = useRouter();
  const [desde, setDesde] = useState(fecha(0));
  const [hasta, setHasta] = useState(fecha(0));
  const [periodoActivo, setPeriodoActivo] = useState("hoy");
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar(d, h) {
    setCargando(true);
    setError("");
    try {
      setReporte(await apiFetch(`/api/ventas/reporte?desde=${d}&hasta=${h}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar(desde, hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function elegirPeriodo(nombre) {
    setPeriodoActivo(nombre);
    let d, h;
    if (nombre === "hoy") {
      d = h = fecha(0);
    } else if (nombre === "ayer") {
      d = h = fecha(-1);
    } else if (nombre === "mes") {
      d = primerDiaDelMes();
      h = fecha(0);
    }
    setDesde(d);
    setHasta(h);
    cargar(d, h);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/ventas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Reporte de ventas</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-2 text-sm font-medium text-slate-500">Período</p>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              { valor: "hoy", etiqueta: "Hoy" },
              { valor: "ayer", etiqueta: "Ayer" },
              { valor: "mes", etiqueta: "Mes" },
            ].map((p) => (
              <button
                key={p.valor}
                onClick={() => elegirPeriodo(p.valor)}
                className={`rounded-xl py-2 font-semibold transition ${
                  periodoActivo === p.valor ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPeriodoActivo("");
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setPeriodoActivo("");
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              onClick={() => cargar(desde, hasta)}
              className="rounded-xl bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Consultar
            </button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : reporte ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white p-5 text-center shadow shadow-slate-200">
                <p className="text-xs text-slate-400">Total vendido</p>
                <p className="text-xl font-extrabold text-blue-900">Gs {formatoGs.format(reporte.totalVendido)}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 text-center shadow shadow-slate-200">
                <p className="text-xs text-slate-400">Ventas</p>
                <p className="text-xl font-extrabold text-blue-900">{reporte.cantidadVentas}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 text-center shadow shadow-slate-200">
                <p className="text-xs text-slate-400">Ticket promedio</p>
                <p className="text-xl font-extrabold text-blue-900">Gs {formatoGs.format(Math.round(reporte.ticketPromedio))}</p>
              </div>
            </div>

            <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <p className="mb-3 font-semibold text-slate-700">Productos más vendidos</p>
              {reporte.topProductos.length === 0 ? (
                <p className="text-sm text-slate-400">Sin ventas en este período.</p>
              ) : (
                <div className="flex flex-col divide-y divide-slate-100">
                  {reporte.topProductos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-700">{p.nombre}</span>
                      <div className="text-right">
                        <span className="font-semibold text-slate-800">{p.cantidad_vendida}</span>
                        <span className="ml-2 text-slate-400">Gs {formatoGs.format(p.total_vendido)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <p className="mb-3 font-semibold text-slate-700">Por forma de pago</p>
              {reporte.porFormaPago.length === 0 ? (
                <p className="text-sm text-slate-400">Sin cobros en efectivo/tarjeta/transferencia en este período.</p>
              ) : (
                <div className="flex flex-col divide-y divide-slate-100">
                  {reporte.porFormaPago.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-700">{ETIQUETA_FORMA_PAGO[f.forma_pago]}</span>
                      <span className="font-semibold text-slate-800">Gs {formatoGs.format(f.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
