"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { nombresEmpresa } from "@/lib/encabezadoEmpresa";
import PiePublicidadEmpremas from "@/components/PiePublicidadEmpremas";

const formatoGs = new Intl.NumberFormat("es-PY");

function fecha(f) {
  // Un "YYYY-MM-DD" suelto se interpreta como UTC medianoche - en
  // America/Asuncion eso muestra el día anterior; forzar hora local lo evita.
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

// useSearchParams() exige un limite de Suspense arriba, mismo criterio
// ya usado en citas/nueva.
export default function ExtractoProductosCliente() {
  return (
    <Suspense fallback={null}>
      <ExtractoProductosContenido />
    </Suspense>
  );
}

function ExtractoProductosContenido() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const recuadroRef = useRef(null);

  const [datos, setDatos] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [error, setError] = useState("");
  const [desde, setDesde] = useState(searchParams.get("desde") || "");
  const [hasta, setHasta] = useState(searchParams.get("hasta") || "");
  const [periodoActivo, setPeriodoActivo] = useState("");
  const [vista, setVista] = useState("resumen");

  const cargar = useCallback(
    async (params) => {
      setError("");
      try {
        const query = new URLSearchParams();
        if (params.desde) query.set("desde", params.desde);
        if (params.hasta) query.set("hasta", params.hasta);
        const qs = query.toString();
        setDatos(await apiFetch(`/api/clientes/${id}/extracto-productos${qs ? `?${qs}` : ""}`));
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
    cargar({ desde: searchParams.get("desde") || "", hasta: searchParams.get("hasta") || "" });
    apiFetch("/api/empresas/actual").then(setEmpresa).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    enlace.download = `productos-${datos.cliente.nombre.replace(/\s+/g, "-").toLowerCase()}.png`;
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

  const { cliente, resumen, detalle } = datos;
  const textoPeriodo = hayFiltros
    ? `Período: ${desde ? fecha(desde) : "…"} – ${hasta ? fecha(hasta) : "…"}`
    : "Historial completo";
  const totalGeneral = (vista === "resumen" ? resumen : detalle).reduce(
    (suma, fila) => suma + Number(vista === "resumen" ? fila.total_gastado : fila.subtotal),
    0
  );

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link
              href={`/clientes/${id}/extracto`}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              ← Volver al extracto
            </Link>
            <h1 className="text-2xl font-bold text-navy">Productos de {cliente.nombre}</h1>
          </div>
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
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow shadow-slate-200 print:hidden">
          <p className="mb-2 text-sm font-medium text-slate-500">Qué mostrar</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {[
              { valor: "resumen", etiqueta: "Resumen por producto" },
              { valor: "detalle", etiqueta: "Detalle por compra" },
            ].map((v) => (
              <button
                key={v.valor}
                onClick={() => setVista(v.valor)}
                className={`rounded-xl py-2 font-semibold transition ${
                  vista === v.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {v.etiqueta}
              </button>
            ))}
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
                  cargar({ desde: e.target.value, hasta });
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
                  cargar({ desde, hasta: e.target.value });
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
            <p className="mt-2 text-xl font-bold">
              Productos comprados por {cliente.nombre} {vista === "detalle" ? "(detalle)" : "(resumen)"}
            </p>
            <p className="mb-4 text-sm text-slate-500">
              {textoPeriodo} · Emitido el {fecha(new Date())}
            </p>
          </div>

          {vista === "resumen" ? (
            resumen.length === 0 ? (
              <p className="text-sm text-slate-400">Sin compras en este período.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {resumen.map((p) => (
                  <div key={p.producto_id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-700">{p.producto_nombre}</span>{" "}
                      <span className="text-slate-400">
                        · {formatoGs.format(p.cantidad_total)} {p.unidad_medida} · {p.veces_comprado}{" "}
                        {Number(p.veces_comprado) === 1 ? "compra" : "compras"}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800">Gs {formatoGs.format(p.total_gastado)}</p>
                  </div>
                ))}
              </div>
            )
          ) : detalle.length === 0 ? (
            <p className="text-sm text-slate-400">Sin compras en este período.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {detalle.map((it) => (
                <div key={it.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-700">{it.producto_nombre}</p>
                    <p className="text-xs text-slate-400">
                      {fecha(it.creado_en)} ·{" "}
                      {it.de_numero_formateado ? `Factura ${it.de_numero_formateado}` : `Ticket N° ${it.numero_ticket}`} ·{" "}
                      {formatoGs.format(it.cantidad)} {it.unidad_medida} × Gs {formatoGs.format(it.precio_unitario)}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-800">Gs {formatoGs.format(it.subtotal)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="font-semibold text-slate-700">Total</span>
            <span className="text-lg font-extrabold text-ink">Gs {formatoGs.format(totalGeneral)}</span>
          </div>

          <PiePublicidadEmpremas />
        </div>
      </div>
    </main>
  );
}
