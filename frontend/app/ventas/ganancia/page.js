"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");
const formatoPct = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });

const ETIQUETA_TIPO_PAGO = { contado: "Contado", credito: "Crédito", mayorista: "Mayorista" };

function fecha(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function Tarjeta({ titulo, valor, tono = "normal", ayuda }) {
  const color = tono === "mal" ? "text-red-600" : tono === "bien" ? "text-green-700" : "text-navy";
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow shadow-slate-200">
      <p className="text-xs text-slate-400">{titulo}</p>
      <p className={`text-lg font-extrabold ${color}`}>{valor}</p>
      {ayuda && <p className="mt-0.5 text-[11px] text-slate-400">{ayuda}</p>}
    </div>
  );
}

export default function GananciaPorVentas() {
  const router = useRouter();
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(fecha(0));
  const [periodoActivo, setPeriodoActivo] = useState("mes");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState("fecha");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar(d, h, q) {
    setCargando(true);
    setError("");
    try {
      const query = new URLSearchParams({ desde: d, hasta: h });
      if (q) query.set("q", q);
      setDatos(await apiFetch(`/api/ventas/ganancia?${query.toString()}`));
    } catch (err) {
      setError(err.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar(desde, hasta, busqueda);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function elegirPeriodo(nombre) {
    setPeriodoActivo(nombre);
    let d, h;
    if (nombre === "hoy") {
      d = h = fecha(0);
    } else if (nombre === "ayer") {
      d = h = fecha(-1);
    } else {
      d = primerDiaDelMes();
      h = fecha(0);
    }
    setDesde(d);
    setHasta(h);
    cargar(d, h, busqueda);
  }

  const t = datos?.totales;
  const ventas = datos
    ? [...datos.ventas].sort((a, b) => {
        if (orden === "ganancia") return b.ganancia - a.ganancia;
        if (orden === "menor") return a.ganancia - b.ganancia;
        if (orden === "margen") return a.margenPct - b.margenPct;
        return 0;
      })
    : [];

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="py-6">
          <Link href="/ventas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Ganancia por ventas</h1>
          <p className="text-sm text-slate-500">
            Lo cobrado en cada venta menos lo que costaba la mercadería cuando se vendió. No incluye gastos generales
            (alquiler, sueldos): esos se ven en el Balance del mes.
          </p>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-2 text-sm font-medium text-slate-500">Período</p>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              { valor: "hoy", etiqueta: "Hoy" },
              { valor: "ayer", etiqueta: "Ayer" },
              { valor: "mes", etiqueta: "Este mes" },
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
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[8rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPeriodoActivo("");
                  cargar(e.target.value, hasta, busqueda);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <div className="min-w-[8rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setPeriodoActivo("");
                  cargar(desde, e.target.value, busqueda);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              cargar(desde, hasta, busqueda);
            }}
            className="mt-3 flex gap-2"
          >
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar por cliente o cédula/RUC..."
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
            <button type="submit" className="rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-light">
              Consultar
            </button>
          </form>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : datos ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tarjeta titulo="Vendido" valor={`Gs ${formatoGs.format(t.vendido)}`} ayuda={`${t.cantidadVentas} ventas`} />
              <Tarjeta titulo="Costo" valor={`Gs ${formatoGs.format(t.costo)}`} />
              <Tarjeta
                titulo="Ganancia"
                valor={`Gs ${formatoGs.format(t.ganancia)}`}
                tono={t.ganancia < 0 ? "mal" : "bien"}
              />
              <Tarjeta titulo="Margen" valor={`${formatoPct.format(t.margenPct)} %`} ayuda="sobre lo vendido" />
            </div>

            {(t.comision > 0 || t.pendienteDeCobro > 0) && (
              <div className="mb-3 rounded-2xl bg-white p-4 text-sm shadow shadow-slate-200">
                {t.comision > 0 && (
                  <p className="flex justify-between py-1 text-slate-600">
                    <span>Comisiones a vendedores</span>
                    <span className="font-semibold">Gs {formatoGs.format(t.comision)}</span>
                  </p>
                )}
                {t.comision > 0 && (
                  <p className="flex justify-between py-1 text-slate-600">
                    <span>Ganancia después de comisiones</span>
                    <span className={`font-semibold ${t.gananciaTrasComision < 0 ? "text-red-600" : "text-green-700"}`}>
                      Gs {formatoGs.format(t.gananciaTrasComision)}
                    </span>
                  </p>
                )}
                {t.pendienteDeCobro > 0 && (
                  <p className="flex justify-between py-1 text-slate-600">
                    <span>Todavía sin cobrar (ventas a crédito)</span>
                    <span className="font-semibold text-amber-700">Gs {formatoGs.format(t.pendienteDeCobro)}</span>
                  </p>
                )}
              </div>
            )}

            {t.lineasSinCosto > 0 && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ⚠ {t.lineasSinCosto} {t.lineasSinCosto === 1 ? "línea vendida no tenía" : "líneas vendidas no tenían"} costo
                cargado: esa parte figura como ganancia total y puede estar inflada. Cargá el costo de esos productos en
                Stock.
              </p>
            )}
            {datos.truncado && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Hay más de 2.000 ventas en este período: se muestran las más recientes (los totales de arriba sí incluyen
                todas). Acortá el período para ver el detalle completo.
              </p>
            )}

            <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-700">Venta por venta</p>
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600"
                >
                  <option value="fecha">Más recientes primero</option>
                  <option value="ganancia">Mayor ganancia primero</option>
                  <option value="menor">Menor ganancia primero</option>
                  <option value="margen">Menor margen primero</option>
                </select>
              </div>
              {ventas.length === 0 ? (
                <p className="text-sm text-slate-400">Sin ventas en este período.</p>
              ) : (
                <div className="flex flex-col divide-y divide-slate-100">
                  {ventas.map((v) => {
                    const f = new Date(v.creadoEn);
                    return (
                      <Link
                        key={v.id}
                        href={`/ventas/${v.id}`}
                        className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">
                            {v.clienteNombre || "Consumidor Final"}
                            {v.numeroTicket != null && <span className="ml-2 text-slate-400">#{v.numeroTicket}</span>}
                          </p>
                          <p className="text-xs text-slate-400">
                            {f.toLocaleDateString("es-PY")} {f.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}
                            {" · "}
                            {ETIQUETA_TIPO_PAGO[v.tipoPago] || v.tipoPago}
                            {v.saldoPendiente > 0 && <span className="text-amber-700"> · sin cobrar Gs {formatoGs.format(v.saldoPendiente)}</span>}
                            {v.lineasSinCosto > 0 && <span className="text-amber-700"> · ⚠ sin costo</span>}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-bold ${v.ganancia < 0 ? "text-red-600" : "text-green-700"}`}>
                            {v.ganancia < 0 ? "−" : ""}Gs {formatoGs.format(Math.abs(v.ganancia))}
                          </p>
                          <p className="text-xs text-slate-400">
                            vendido {formatoGs.format(v.vendido)} · costo {formatoGs.format(v.costo)} · {formatoPct.format(v.margenPct)} %
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
