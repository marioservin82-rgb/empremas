"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { nombresEmpresa } from "@/lib/encabezadoEmpresa";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_TIPO_PAGO = {
  contado: "Contado",
  credito: "Crédito",
  mayorista: "Mayorista",
};

function fecha(f) {
  // Un string "YYYY-MM-DD" suelto (desde/hasta) se interpreta como UTC
  // medianoche si se lo pasa directo a Date - en un huso horario negativo
  // (America/Asuncion) eso muestra el día anterior. Forzando hora local
  // evita ese corrimiento; los timestamps completos que ya vienen del
  // backend (creado_en) siguen el camino normal, sin tocar.
  const esSoloFecha = typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f);
  const d = esSoloFecha ? new Date(`${f}T00:00:00`) : new Date(f);
  return d.toLocaleDateString("es-PY");
}

function fechaISO(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function ExtractoCliente() {
  const router = useRouter();
  const { id } = useParams();
  const recuadroRef = useRef(null);

  const [datos, setDatos] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [error, setError] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [periodoActivo, setPeriodoActivo] = useState("");

  const cargar = useCallback(
    async (params) => {
      setError("");
      try {
        const query = new URLSearchParams();
        if (params.desde) query.set("desde", params.desde);
        if (params.hasta) query.set("hasta", params.hasta);
        const qs = query.toString();
        setDatos(await apiFetch(`/api/clientes/${id}/extracto${qs ? `?${qs}` : ""}`));
      } catch (err) {
        setError(err.message);
      }
    },
    [id]
  );

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar({});
    apiFetch("/api/empresas/actual").then(setEmpresa).catch(() => {});
  }, [cargar, router]);

  function elegirPeriodo(nombre) {
    setPeriodoActivo(nombre);
    let d, h;
    if (nombre === "hoy") {
      d = h = fechaISO(0);
    } else if (nombre === "ayer") {
      d = h = fechaISO(-1);
    } else if (nombre === "mes") {
      d = primerDiaDelMes();
      h = fechaISO(0);
    }
    setDesde(d);
    setHasta(h);
    cargar({ desde: d, hasta: h });
  }

  function limpiarFiltros() {
    setDesde("");
    setHasta("");
    setPeriodoActivo("");
    cargar({});
  }

  async function descargarImagen() {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const enlace = document.createElement("a");
    enlace.download = `extracto-${datos.cliente.nombre.replace(/\s+/g, "-").toLowerCase()}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  const hayFiltros = desde || hasta;

  if (!datos) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-slate-500">Cargando...</p>
        )}
      </main>
    );
  }

  const { cliente, ventas, cobros, ajustesSaldo } = datos;
  const textoPeriodo = hayFiltros
    ? `Período: ${desde ? fecha(desde) : "…"} – ${hasta ? fecha(hasta) : "…"}`
    : "Historial completo";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
              Extracto de {cliente.nombre}
              {cliente.categoriaCliente && (
                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy">
                  {cliente.categoriaCliente.nombre}
                </span>
              )}
            </h1>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/clientes/${id}/ajustar-saldo`}
              className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-200 print:hidden"
            >
              Ajustar saldo
            </Link>
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
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow shadow-slate-200 print:hidden">
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
              onClick={() => cargar({ desde, hasta })}
              className="rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-light"
            >
              Consultar
            </button>
          </div>

          {hayFiltros && (
            <button onClick={limpiarFiltros} className="mt-3 text-sm font-semibold text-slate-500 hover:text-slate-700">
              Ver historial completo
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div ref={recuadroRef} className="reporte-imprimible rounded-xl bg-white p-6 shadow">
          <style>{"@page { size: A4; margin: 15mm; }"}</style>
          <div className="mb-4 hidden print:block">
            {empresa && (
              <>
                <p className="text-lg font-bold">{nombresEmpresa(empresa).principal}</p>
                {nombresEmpresa(empresa).secundario && (
                  <p className="text-sm text-slate-500">{nombresEmpresa(empresa).secundario}</p>
                )}
                <p className="text-sm text-slate-500">RUC {empresa.ruc}</p>
              </>
            )}
            <p className="mt-2 text-xl font-bold">Extracto de {cliente.nombre}</p>
            <p className="text-sm text-slate-500">
              {textoPeriodo} · Emitido el {fecha(new Date())}
            </p>
          </div>
          <p className="mb-4 text-sm font-medium text-slate-500 print:hidden">{textoPeriodo}</p>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-50 p-5 text-center">
              <p className="text-sm text-slate-400">Debe hoy</p>
              <p className="text-2xl font-extrabold text-ink">Gs {formatoGs.format(cliente.saldo)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5 text-center">
              <p className="text-sm text-slate-400">Crédito disponible</p>
              <p className="text-2xl font-extrabold text-ink">
                Gs {formatoGs.format(cliente.saldo_disponible)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5 text-center">
              <p className="text-sm text-slate-400">Volumen este mes</p>
              <p className="text-2xl font-extrabold text-ink">Gs {formatoGs.format(cliente.volumenMes)}</p>
            </div>
          </div>

          <div className="mb-4">
            <h2 className="mb-3 font-semibold text-slate-700">Ventas</h2>
            {ventas.length === 0 ? (
              <p className="text-sm text-slate-400">Sin ventas en este período.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {ventas.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-700">{fecha(v.creado_en)}</span>{" "}
                      <span className="text-slate-400">
                        · {v.de_numero_formateado ? `Factura ${v.de_numero_formateado}` : `Ticket N° ${v.numero_ticket}`} ·{" "}
                        {ETIQUETA_TIPO_PAGO[v.tipo_pago]}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-800">Gs {formatoGs.format(v.total)}</p>
                      {v.tipo_pago === "credito" && Number(v.saldo_pendiente) > 0 && (
                        <p className="text-xs font-semibold text-ink-muted">pendiente Gs {formatoGs.format(v.saldo_pendiente)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4">
            <h2 className="mb-3 font-semibold text-slate-700">Cobros</h2>
            {cobros.length === 0 ? (
              <p className="text-sm text-slate-400">Sin cobros en este período.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {cobros.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-500">
                      Recibo N° {c.numero_recibo} · {fecha(c.creado_en)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-ink">Gs {formatoGs.format(c.monto)}</span>
                      <Link href={`/clientes/${id}/cobro/${c.id}`} className="font-semibold text-navy hover:text-brand">
                        Reimprimir
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {ajustesSaldo && ajustesSaldo.length > 0 && (
            <div>
              <h2 className="mb-3 font-semibold text-slate-700">Ajustes de saldo</h2>
              <div className="flex flex-col divide-y divide-slate-100">
                {ajustesSaldo.map((a) => (
                  <div key={a.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{fecha(a.creado_en)}</span>
                      <span className="font-semibold text-slate-700">
                        Gs {formatoGs.format(a.saldo_anterior)} → Gs {formatoGs.format(a.saldo_nuevo)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{a.motivo}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
