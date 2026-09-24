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
};

function fecha(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function Compras() {
  const router = useRouter();
  const [compras, setCompras] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [periodoActivo, setPeriodoActivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const buscar = useCallback(async (params) => {
    setCargando(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (params.q) query.set("q", params.q);
      if (params.desde) query.set("desde", params.desde);
      if (params.hasta) query.set("hasta", params.hasta);
      const qs = query.toString();
      setCompras(await apiFetch(`/api/compras${qs ? `?${qs}` : ""}`));
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
    buscar({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
            <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver a Stock
            </Link>
            <h1 className="text-2xl font-bold text-navy">Compras</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/proveedores" className="text-sm font-semibold text-navy hover:text-brand">
              Proveedores
            </Link>
            <Link
              href="/compras/nueva"
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              + Registrar compra
            </Link>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <form onSubmit={onSubmitBusqueda} className="mb-4 flex gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por proveedor, RUC o N° de factura..."
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
            <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
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
                  periodoActivo === p.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
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
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <button
              onClick={() => buscar({ q: busqueda, desde, hasta })}
              className="rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-light"
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
        ) : compras.length === 0 ? (
          <p className="text-slate-500">No hay compras para este filtro.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {compras.map((c) => (
              <Link
                key={c.id}
                href={`/compras/${c.id}`}
                className={`rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50 ${
                  c.anulada ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {c.proveedor_nombre}
                      {c.anulada && <span className="ml-2 text-sm font-bold text-red-500">ANULADA</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {new Date(c.creado_en).toLocaleDateString("es-PY")}{" "}
                      {new Date(c.creado_en).toLocaleTimeString("es-PY")} · {ETIQUETA_TIPO_PAGO[c.tipo_pago]}
                      {c.numero_factura && ` · Factura ${c.numero_factura}`}
                    </p>
                  </div>
                  <p className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(c.total)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
