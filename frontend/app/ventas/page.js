"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_TIPO_PAGO = {
  contado: "Contado",
  credito: "Crédito",
  mayorista: "Mayorista",
};

function fecha(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function Ventas() {
  const router = useRouter();
  const [ventas, setVentas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [periodoActivo, setPeriodoActivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [puedeVerReporte, setPuedeVerReporte] = useState(false);

  const buscar = useCallback(async (params) => {
    setCargando(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (params.q) query.set("q", params.q);
      if (params.desde) query.set("desde", params.desde);
      if (params.hasta) query.set("hasta", params.hasta);
      const qs = query.toString();
      setVentas(await apiFetch(`/api/ventas${qs ? `?${qs}` : ""}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    // El reporte es solo dueño/encargado (el backend devuelve 403 para
    // cajero); si no da 403, mostramos el link.
    apiFetch("/api/ventas/reporte")
      .then(() => setPuedeVerReporte(true))
      .catch(() => {});
  }, [router]);

  // El texto busca solo (mientras se escribe); desde/hasta se aplican con
  // el botón "Consultar" o los atajos de período, para no relanzar la
  // búsqueda en cada click de fecha.
  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    buscar({ q: busquedaDebounced, desde, hasta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced]);

  function onSubmitBusqueda(e) {
    e.preventDefault();
    buscar({ q: busqueda, desde, hasta });
  }

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
    buscar({ q: busqueda, desde: d, hasta: h });
  }

  function limpiarFiltros() {
    setBusqueda("");
    setDesde("");
    setHasta("");
    setPeriodoActivo("");
    buscar({});
  }

  const hayFiltros = busqueda || desde || hasta;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-start justify-between py-6">
          <div>
            <Link href="/vender" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver a Vender
            </Link>
            <h1 className="text-2xl font-bold text-blue-900">Ventas</h1>
          </div>
          <div className="flex items-center gap-4">
            {puedeVerReporte && (
              <Link href="/ventas/facturas-electronicas" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
                Facturas electrónicas
              </Link>
            )}
            {puedeVerReporte && (
              <Link href="/ventas/reporte" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
                Reporte
              </Link>
            )}
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <form onSubmit={onSubmitBusqueda} className="mb-4 flex gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente o cédula/RUC..."
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            <button type="submit" className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">
              Buscar
            </button>
          </form>

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
              onClick={() => buscar({ q: busqueda, desde, hasta })}
              className="rounded-xl bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Consultar
            </button>
          </div>

          {hayFiltros && (
            <button onClick={limpiarFiltros} className="mt-3 text-sm font-semibold text-slate-500 hover:text-slate-700">
              Limpiar filtros
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : ventas.length === 0 ? (
          <p className="text-slate-500">No hay ventas para este filtro.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {ventas.map((v) => (
              <Link
                key={v.id}
                href={`/ventas/${v.id}`}
                className={`rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50 ${
                  v.anulada ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {v.cliente_nombre || "Consumidor Final"}
                      {v.anulada && <span className="ml-2 text-sm font-bold text-red-500">ANULADA</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {new Date(v.creado_en).toLocaleDateString("es-PY")}{" "}
                      {new Date(v.creado_en).toLocaleTimeString("es-PY")} · {ETIQUETA_TIPO_PAGO[v.tipo_pago]}
                    </p>
                  </div>
                  <p className="text-2xl font-extrabold text-blue-900">Gs {formatoGs.format(v.total)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
