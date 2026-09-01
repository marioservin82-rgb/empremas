"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_COMPROBANTE = {
  ticket_comun: "Ticket común",
  a4: "Hoja A4",
  sin_comprobante: "Sin comprobante",
};

function fecha(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// Buscar un ticket/A4/sin-comprobante ya emitido y convertirlo en Factura
// Legal (SIFEN) sin volver a tocar stock ni caja - la venta ya quedó
// registrada en su momento, esto solo le agrega el documento electrónico
// que le faltaba (mismo mecanismo que ya usa el botón "Reintentar" de
// cualquier Factura Legal, ver convertirAFacturaLegal en el backend).
export default function ConvertirFacturaLegal() {
  const router = useRouter();

  const [ventas, setVentas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [periodoActivo, setPeriodoActivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [seleccionada, setSeleccionada] = useState(null);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [errorConvertir, setErrorConvertir] = useState("");

  const buscar = useCallback(async (params) => {
    setCargando(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (params.q) query.set("q", params.q);
      if (params.desde) query.set("desde", params.desde);
      if (params.hasta) query.set("hasta", params.hasta);
      const qs = query.toString();
      const resultado = await apiFetch(`/api/ventas${qs ? `?${qs}` : ""}`);
      // Solo tiene sentido ofrecer para convertir lo que todavía NO es
      // Factura Legal y no está anulado - el resto queda afuera acá, no
      // hace falta pedirle al backend un filtro nuevo para esto.
      setVentas(resultado.filter((v) => v.tipo_comprobante !== "factura_legal" && !v.anulada));
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
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        if (u.rol !== "dueno" && u.rol !== "encargado") router.push("/panel");
      })
      .catch(() => router.push("/panel"));
    buscar({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    buscar({ q: busquedaDebounced, desde, hasta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced]);

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

  async function confirmarConversion() {
    setErrorConvertir("");
    setConvirtiendo(true);
    try {
      await apiFetch(`/api/ventas/${seleccionada.id}/convertir-factura-legal`, { method: "POST" });
      // El detalle de la venta (/ventas/:id) ya sabe mostrar el estado de
      // la Factura Legal (aprobada/pendiente/error) y el botón
      // "Reintentar" si algo falló en el camino - no hace falta duplicar
      // nada de eso acá.
      router.push(`/ventas/${seleccionada.id}`);
    } catch (err) {
      setErrorConvertir(err.message);
      setConvirtiendo(false);
    }
  }

  const sinRuc = seleccionada && (!seleccionada.cliente_documento || seleccionada.cliente_es_generico);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/ventas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a Ventas
          </Link>
          <h1 className="text-2xl font-bold text-navy">Convertir a Factura Legal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Buscá un ticket ya emitido para pasarlo a Factura Legal (SIFEN) — sin tocar el stock ni volver a
            registrar el ingreso en caja, esa venta ya quedó cargada.
          </p>
        </div>

        {seleccionada ? (
          <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <button
              onClick={() => {
                setSeleccionada(null);
                setErrorConvertir("");
              }}
              className="mb-3 text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              ← Elegir otra venta
            </button>

            <p className="text-lg font-bold text-slate-800">{seleccionada.cliente_nombre || "Consumidor Final"}</p>
            <p className="text-sm text-slate-400">
              {new Date(seleccionada.creado_en).toLocaleDateString("es-PY")}{" "}
              {new Date(seleccionada.creado_en).toLocaleTimeString("es-PY")} ·{" "}
              {ETIQUETA_COMPROBANTE[seleccionada.tipo_comprobante] || seleccionada.tipo_comprobante}
              {seleccionada.numero_ticket ? ` · Ticket N° ${seleccionada.numero_ticket}` : ""}
            </p>
            <p className="mt-2 text-2xl font-extrabold text-navy">Gs {formatoGs.format(seleccionada.total)}</p>

            {sinRuc && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Esta venta no tiene un cliente con RUC/CI asociado — la factura va a salir a nombre de{" "}
                <strong>Consumidor Final</strong> (innominada). Si el cliente te pidió la factura con su RUC,
                cancelá y usá una venta que ya tenga ese cliente cargado.
              </p>
            )}

            <p className="mt-3 rounded-lg bg-tint px-3 py-2 text-sm text-navy">
              La factura sale con la fecha y hora de <strong>hoy</strong> como fecha de emisión — SIFEN no permite
              emitir con la fecha original del ticket.
            </p>

            {errorConvertir && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorConvertir}</p>
            )}

            <button
              onClick={confirmarConversion}
              disabled={convirtiendo}
              className="mt-4 w-full rounded-xl bg-brand py-4 text-lg font-bold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {convirtiendo ? "Convirtiendo..." : "Convertir a Factura Legal"}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <div className="mb-4 flex gap-2">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por cliente o cédula/RUC..."
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
              </div>

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
            ) : ventas.length === 0 ? (
              <p className="text-slate-500">
                No hay tickets convertibles para este filtro (ya son Factura Legal, o están anulados).
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {ventas.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSeleccionada(v)}
                    className="rounded-2xl bg-white p-5 text-left shadow shadow-slate-200 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-bold text-slate-800">{v.cliente_nombre || "Consumidor Final"}</p>
                        <p className="text-sm text-slate-400">
                          {new Date(v.creado_en).toLocaleDateString("es-PY")}{" "}
                          {new Date(v.creado_en).toLocaleTimeString("es-PY")} ·{" "}
                          {ETIQUETA_COMPROBANTE[v.tipo_comprobante] || v.tipo_comprobante}
                          {!v.cliente_documento && (
                            <span className="ml-1 text-amber-600">· sin RUC/CI</span>
                          )}
                        </p>
                      </div>
                      <p className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(v.total)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
