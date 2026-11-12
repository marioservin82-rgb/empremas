"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { linkWhatsapp } from "@/lib/whatsapp";
import { ETIQUETA_ESTADO, ESTILO_ESTADO, fechaLarga, mensajeMembresia, guardarCuotaEnVender } from "@/lib/membresias";

const formatoGs = new Intl.NumberFormat("es-PY");

const FILTROS = [
  ["vigentes", "Vigentes"],
  ["por_vencer", "Por vencer (7 días)"],
  ["gracia", "En gracia"],
  ["vencidas", "Vencidas"],
  ["pendientes", "Sin pagar"],
  ["canceladas", "Canceladas"],
  ["todas", "Todas"],
];

const campo =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

function textoVencimiento(m) {
  if (m.estado === "pendiente") return "Todavía no pagó ninguna cuota";
  if (m.estado === "cancelada") return `Vencía el ${fechaLarga(m.venceEn)}`;
  if (m.dias >= 0) return `Vence el ${fechaLarga(m.venceEn)} (${m.dias === 0 ? "hoy" : `en ${m.dias} día${m.dias === 1 ? "" : "s"}`})`;
  return `Venció el ${fechaLarga(m.venceEn)} (hace ${-m.dias} día${m.dias === -1 ? "" : "s"})`;
}

export default function MembresiasPagina() {
  const router = useRouter();
  const [yo, setYo] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [filtro, setFiltro] = useState("vigentes");
  const [busqueda, setBusqueda] = useState("");
  const q = useDebounced(busqueda, 300);
  const [lista, setLista] = useState(null);
  const [planes, setPlanes] = useState([]);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [detalle, setDetalle] = useState(null);

  // Alta de membresia
  const [creando, setCreando] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const qCliente = useDebounced(busquedaCliente, 300);
  const [clientes, setClientes] = useState([]);
  const [clienteElegido, setClienteElegido] = useState(null);
  const [planId, setPlanId] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setError("");
    apiFetch(`/api/membresias?estado=${filtro}&q=${encodeURIComponent(q)}`)
      .then((d) => setLista(d.membresias))
      .catch((err) => setError(err.message));
  }, [filtro, q]);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        if (u.rol !== "dueno" && u.rol !== "encargado") router.push("/panel");
        setYo(u);
      })
      .catch(() => {});
    apiFetch("/api/empresas/actual").then(setEmpresa).catch(() => {});
    apiFetch("/api/membresias/planes")
      .then((d) => setPlanes(d.planes.filter((p) => p.activo)))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!creando || !qCliente.trim()) {
      setClientes([]);
      return;
    }
    apiFetch(`/api/clientes?q=${encodeURIComponent(qCliente)}`)
      .then((r) => setClientes(r.filter((c) => !c.es_generico)))
      .catch(() => setClientes([]));
  }, [creando, qCliente]);

  async function crear(e) {
    e.preventDefault();
    if (!clienteElegido || !planId) return;
    setGuardando(true);
    setError("");
    try {
      await apiFetch("/api/membresias", { method: "POST", body: JSON.stringify({ clienteId: clienteElegido.id, planId }) });
      setCreando(false);
      setClienteElegido(null);
      setBusquedaCliente("");
      setPlanId("");
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cobrarCuota(m) {
    setError("");
    try {
      const cliente = await apiFetch(`/api/clientes/${m.clienteId}`);
      guardarCuotaEnVender(m, cliente);
      router.push("/vender");
    } catch (err) {
      setError(err.message);
    }
  }

  async function cambiarCancelada(m, cancelada) {
    if (cancelada && !window.confirm(`¿Cancelar la membresía de ${m.clienteNombre}? Pierde los beneficios; el historial se conserva.`)) return;
    setError("");
    try {
      await apiFetch(`/api/membresias/${m.id}`, { method: "PATCH", body: JSON.stringify({ cancelada }) });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function verHistorial(m) {
    if (abierto === m.id) {
      setAbierto(null);
      return;
    }
    setAbierto(m.id);
    setDetalle(null);
    try {
      setDetalle(await apiFetch(`/api/membresias/${m.id}`));
    } catch (err) {
      setError(err.message);
    }
  }

  const nombreEmpresa = empresa?.nombre_fantasia || empresa?.razon_social || "nuestro local";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <Link href="/panel" className="text-sm font-semibold text-slate-400 hover:text-navy">
              ← Panel
            </Link>
            <h1 className="text-2xl font-bold text-navy">⭐ Membresías</h1>
          </div>
          {yo?.rol === "dueno" && (
            <Link href="/membresias/planes" className="text-sm font-semibold text-navy hover:text-brand">
              Planes
            </Link>
          )}
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

        <div className="mb-4 rounded-2xl bg-white p-4 shadow shadow-slate-200">
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTROS.map(([v, t]) => (
              <button
                key={v}
                onClick={() => setFiltro(v)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  filtro === v ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={campo} placeholder="Buscar por nombre o celular…" />
        </div>

        {!creando ? (
          <button
            onClick={() => setCreando(true)}
            disabled={planes.length === 0}
            className="mb-4 w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-50"
          >
            {planes.length === 0 ? "Creá un plan primero (botón Planes)" : "+ Nueva membresía"}
          </button>
        ) : (
          <form onSubmit={crear} className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 text-lg font-bold text-slate-800">Nueva membresía</p>
            <label className="mb-1 block text-sm font-medium text-slate-700">Cliente</label>
            {clienteElegido ? (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="font-semibold text-slate-800">{clienteElegido.nombre}</span>
                <button type="button" onClick={() => setClienteElegido(null)} className="text-sm font-medium text-red-500">
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="mb-3">
                <input
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  className={campo}
                  placeholder="Buscar cliente por nombre o cédula…"
                  autoFocus
                />
                {clientes.length > 0 && (
                  <div className="mt-2 flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {clientes.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setClienteElegido(c)}
                        className="px-4 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        {c.nombre} {c.documento ? <span className="text-slate-400">· {c.documento}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <label className="mb-1 block text-sm font-medium text-slate-700">Plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={campo}>
              <option value="">Elegí un plan…</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · Gs {formatoGs.format(p.precioMensual)}/mes
                  {p.descuentoServiciosPct > 0 ? ` · ${p.descuentoServiciosPct}% en servicios` : ""}
                </option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={guardando || !clienteElegido || !planId}
                className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Crear membresía"}
              </button>
              <button
                type="button"
                onClick={() => setCreando(false)}
                className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">Queda “sin pagar” hasta que cobres la primera cuota.</p>
          </form>
        )}

        {lista === null ? (
          <p className="text-slate-400">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-slate-500">No hay membresías en esta vista.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lista.map((m) => (
              <div key={m.id} className="rounded-2xl bg-white p-4 shadow shadow-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-slate-800">{m.clienteNombre}</p>
                    <p className="text-sm text-slate-500">
                      Plan {m.planNombre} · Gs {formatoGs.format(m.precioMensual)}/mes
                      {m.descuentoServiciosPct > 0 ? ` · ${m.descuentoServiciosPct}% en servicios` : ""}
                    </p>
                    <p className="text-sm text-slate-400">{textoVencimiento(m)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${ESTILO_ESTADO[m.estado]}`}>{ETIQUETA_ESTADO[m.estado]}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                  {!m.cancelada && (
                    <button onClick={() => cobrarCuota(m)} className="rounded-lg bg-brand px-3 py-1.5 text-white hover:bg-brand-light">
                      Cobrar cuota
                    </button>
                  )}
                  {!m.cancelada && m.clienteCelular && (
                    <a
                      href={linkWhatsapp(m.clienteCelular, mensajeMembresia(m, nombreEmpresa))}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"
                    >
                      Recordar por WhatsApp
                    </a>
                  )}
                  <button onClick={() => verHistorial(m)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200">
                    {abierto === m.id ? "Ocultar historial" : "Historial de pagos"}
                  </button>
                  {m.cancelada ? (
                    <button onClick={() => cambiarCancelada(m, false)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200">
                      Reactivar
                    </button>
                  ) : (
                    <button onClick={() => cambiarCancelada(m, true)} className="rounded-lg bg-red-50 px-3 py-1.5 text-red-600 hover:bg-red-100">
                      Cancelar
                    </button>
                  )}
                </div>

                {abierto === m.id && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                    {!detalle ? (
                      <p className="text-slate-400">Cargando…</p>
                    ) : detalle.pagos.length === 0 ? (
                      <p className="text-slate-400">Todavía no hay cuotas pagadas.</p>
                    ) : (
                      detalle.pagos.map((p) => (
                        <div key={p.id} className={`flex justify-between py-1 ${p.anulado ? "text-red-500 line-through" : "text-slate-700"}`}>
                          <span>
                            {fechaLarga(p.periodoDesde)} → {fechaLarga(p.periodoHasta)} · Ticket N° {p.numeroTicket}
                          </span>
                          <span className="font-semibold">Gs {formatoGs.format(p.monto)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
