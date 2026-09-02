"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_TIPO_PAGO = {
  contado: "Contado",
  credito: "Crédito",
  mayorista: "Mayorista",
};

const ETIQUETA_FORMA_PAGO = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};

function fecha(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

function fechaLegible(f) {
  return new Date(`${f}T00:00:00`).toLocaleDateString("es-PY");
}

function hora(f) {
  return new Date(f).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}

export default function ResumenDia() {
  const router = useRouter();
  const [fechaConsulta, setFechaConsulta] = useState(fecha(0));
  const [periodoActivo, setPeriodoActivo] = useState("hoy");
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState("");
  const [mostrarSelectorSucursal, setMostrarSelectorSucursal] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar(f, sucId) {
    setCargando(true);
    setError("");
    try {
      const query = sucId ? `?fecha=${f}&sucursalId=${sucId}` : `?fecha=${f}`;
      setResumen(await apiFetch(`/api/ventas/resumen-dia${query}`));
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
    apiFetch("/api/usuarios/yo")
      .then((yo) => {
        if (yo.rol === "dueno" || yo.rol === "encargado") {
          apiFetch("/api/empresas/actual")
            .then((e) => {
              if (e.limite_sucursales > 1) {
                setMostrarSelectorSucursal(true);
                apiFetch("/api/sucursales").then(setSucursales).catch(() => {});
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    cargar(fechaConsulta, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function elegirPeriodo(nombre) {
    setPeriodoActivo(nombre);
    const f = nombre === "ayer" ? fecha(-1) : fecha(0);
    setFechaConsulta(f);
    cargar(f, sucursalId);
  }

  function cambiarFechaPuntual(valor) {
    setPeriodoActivo("");
    setFechaConsulta(valor);
    cargar(valor, sucursalId);
  }

  function cambiarSucursal(valor) {
    setSucursalId(valor);
    cargar(fechaConsulta, valor);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6 print:hidden">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Ventas de hoy</h1>
          </div>
          {resumen && (
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              Imprimir resumen del día
            </button>
          )}
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200 print:hidden">
          <p className="mb-2 text-sm font-medium text-slate-500">Período</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[
              { valor: "hoy", etiqueta: "Hoy" },
              { valor: "ayer", etiqueta: "Ayer" },
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
          <label className="mb-1 block text-xs font-medium text-slate-500">O elegí una fecha puntual</label>
          <input
            type="date"
            value={fechaConsulta}
            onChange={(e) => cambiarFechaPuntual(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          {mostrarSelectorSucursal && (
            <>
              <label className="mb-1 mt-4 block text-xs font-medium text-slate-500">Sucursal</label>
              <select
                value={sucursalId}
                onChange={(e) => cambiarSucursal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              >
                <option value="">Todas las sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-center text-slate-500">Cargando...</p>
        ) : resumen ? (
          <div className="reporte-imprimible rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <style>{"@page { size: A4; margin: 15mm; }"}</style>
            <div className="mb-4 hidden print:block">
              <p className="text-xl font-bold">Resumen de ventas del día</p>
              <p className="text-sm text-slate-500">{fechaLegible(resumen.fecha)}</p>
            </div>

            <p className="mb-4 text-sm font-medium text-slate-500 print:hidden">{fechaLegible(resumen.fecha)}</p>

            <div className="mb-6 rounded-2xl bg-slate-50 p-5 text-center print:border print:border-slate-300 print:bg-white">
              <p className="text-xs text-slate-400">Total vendido</p>
              <p className="text-4xl font-extrabold text-navy">Gs {formatoGs.format(resumen.totalVendido)}</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-400">Contado</p>
                  <p className="font-bold text-slate-800">Gs {formatoGs.format(resumen.totalContado)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Crédito</p>
                  <p className="font-bold text-slate-800">Gs {formatoGs.format(resumen.totalCredito)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Ventas</p>
                  <p className="font-bold text-slate-800">{resumen.cantidadVentas}</p>
                </div>
              </div>

              {resumen.totalPorFormaPago && Object.values(resumen.totalPorFormaPago).some((monto) => monto > 0) && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="mb-2 text-xs text-slate-400">Contado, por forma de pago</p>
                  <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                    {Object.entries(resumen.totalPorFormaPago)
                      .filter(([, monto]) => monto > 0)
                      .map(([forma, monto]) => (
                        <div key={forma}>
                          <p className="text-xs text-slate-400">{ETIQUETA_FORMA_PAGO[forma]}</p>
                          <p className="text-sm font-bold text-slate-800">Gs {formatoGs.format(monto)}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {resumen.ventas.length === 0 ? (
              <p className="text-sm text-slate-400">Sin ventas registradas en este período.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {resumen.ventas.map((v) => (
                  <div key={v.id} className="py-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {hora(v.creado_en)} · Ticket #{v.numero_ticket ?? "—"}
                      </span>
                      <span className="font-bold text-navy">Gs {formatoGs.format(v.total)}</span>
                    </div>
                    <p className="text-slate-500">
                      {v.items.map((it) => `${it.producto_nombre} ×${it.cantidad}`).join(", ")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                      <span>{ETIQUETA_TIPO_PAGO[v.tipo_pago]}</span>
                      {v.pagos.length > 0 && (
                        <span>{v.pagos.map((p) => ETIQUETA_FORMA_PAGO[p.forma_pago]).join(" + ")}</span>
                      )}
                      {v.tipo_pago === "credito" && v.cliente_nombre && <span>Cliente: {v.cliente_nombre}</span>}
                      <span>Cajero: {v.usuario_nombre}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-16 hidden print:block">
              <div className="mx-auto w-64 border-t border-slate-800 pt-2 text-center text-sm">
                Firma: ______________________
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
