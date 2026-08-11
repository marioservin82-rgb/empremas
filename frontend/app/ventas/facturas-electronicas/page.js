"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const ESTILO_ESTADO = {
  pendiente: "bg-amber-100 text-amber-700",
  en_lote: "bg-amber-100 text-amber-700",
  enviado: "bg-amber-100 text-amber-700",
  aprobado: "bg-emerald-100 text-emerald-700",
  rechazado: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};

const ETIQUETA_ESTADO = {
  pendiente: "Pendiente",
  en_lote: "Pendiente",
  enviado: "Pendiente",
  aprobado: "Aprobada",
  rechazado: "Rechazada",
  error: "Error de envío",
};

function fecha(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function FacturasElectronicas() {
  const router = useRouter();
  const [facturas, setFacturas] = useState([]);
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
      if (params.desde) query.set("desde", params.desde);
      if (params.hasta) query.set("hasta", params.hasta);
      const qs = query.toString();
      setFacturas(await apiFetch(`/api/ventas/facturas-electronicas${qs ? `?${qs}` : ""}`));
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
  }, [buscar, router]);

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
    buscar({ desde: d, hasta: h });
  }

  function limpiarFiltros() {
    setDesde("");
    setHasta("");
    setPeriodoActivo("");
    buscar({});
  }

  const hayFiltros = desde || hasta;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/ventas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a Ventas
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Facturas electrónicas</h1>
          <p className="text-sm text-slate-500">Solo las ventas facturadas como Factura Legal (SIFEN).</p>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow shadow-slate-200">
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
              onClick={() => buscar({ desde, hasta })}
              className="rounded-xl bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Consultar
            </button>
          </div>

          {hayFiltros && (
            <button onClick={limpiarFiltros} className="mt-3 text-sm font-semibold text-slate-500 hover:text-slate-700">
              Ver todo
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : facturas.length === 0 ? (
          <p className="text-slate-500">Todavía no emitiste ninguna Factura Legal en este período.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {facturas.map((f) => (
              <Link
                key={f.id}
                href={`/ventas/${f.id}`}
                className={`block rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50 ${
                  f.anulada ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {f.de_numero_formateado || `Ticket N° ${f.numero_ticket}`}
                      {f.anulada && <span className="ml-2 text-sm font-bold text-red-500">ANULADA</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {f.cliente_nombre || "Consumidor Final"} ·{" "}
                      {new Date(f.creado_en).toLocaleDateString("es-PY")}
                    </p>
                    {f.de_estado === "rechazado" || f.de_estado === "error" ? (
                      <p className="mt-1 text-xs text-red-500">{f.de_mensaje_error}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-blue-900">Gs {formatoGs.format(f.total)}</p>
                    <span
                      className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                        ESTILO_ESTADO[f.de_estado] || "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {ETIQUETA_ESTADO[f.de_estado] || "Sin enviar"}
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
