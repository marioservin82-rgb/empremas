"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ComprobanteRetiro from "./ComprobanteRetiro";

const formatoGs = new Intl.NumberFormat("es-PY");

const MOTIVOS_RETIRO = [
  { valor: "pago_proveedor", etiqueta: "Pago a proveedor" },
  { valor: "gasto_puntual", etiqueta: "Gasto puntual" },
  { valor: "retiro_personal", etiqueta: "Retiro personal del dueño" },
  { valor: "envio_tercero", etiqueta: "Envío con un tercero" },
  { valor: "otro", etiqueta: "Otro" },
];

function formatoFechaHora(fecha) {
  const d = new Date(fecha);
  return `${d.toLocaleDateString("es-PY")} ${d.toLocaleTimeString("es-PY")}`;
}

export default function Caja() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [turno, setTurno] = useState(undefined); // undefined = cargando, null = sin turno
  const [montoInicial, setMontoInicial] = useState("");
  const [montoDeclarado, setMontoDeclarado] = useState("");
  const [resultadoCierre, setResultadoCierre] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [puedeVerHistorial, setPuedeVerHistorial] = useState(false);

  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [yo, setYo] = useState(null);
  const [retiros, setRetiros] = useState([]);
  const [mostrarFormRetiro, setMostrarFormRetiro] = useState(false);
  const [montoRetiro, setMontoRetiro] = useState("");
  const [motivoRetiro, setMotivoRetiro] = useState("");
  const [detalleRetiro, setDetalleRetiro] = useState("");
  const [personaRetira, setPersonaRetira] = useState("");
  const [pinRetiro, setPinRetiro] = useState("");
  const [enviandoRetiro, setEnviandoRetiro] = useState(false);
  const [errorRetiro, setErrorRetiro] = useState("");
  const [retiroCreado, setRetiroCreado] = useState(null);

  const [meseros, setMeseros] = useState([]);
  const [mostrarFormEntrega, setMostrarFormEntrega] = useState(false);
  const [montoEntrega, setMontoEntrega] = useState("");
  const [meseroIdEntrega, setMeseroIdEntrega] = useState("");
  const [notaEntrega, setNotaEntrega] = useState("");
  const [enviandoEntrega, setEnviandoEntrega] = useState(false);
  const [errorEntrega, setErrorEntrega] = useState("");

  async function cargarTurno() {
    try {
      const actual = await apiFetch("/api/turnos/actual");
      setTurno(actual);
      if (actual) cargarRetiros(actual.id);
    } catch (err) {
      setError(err.message);
    }
  }

  function cargarRetiros(turnoId) {
    apiFetch(`/api/turnos/${turnoId}/retiros`)
      .then(setRetiros)
      .catch(() => {});
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargarTurno();
    apiFetch("/api/empresas/actual").then(setEmpresaInfo).catch(() => {});
    apiFetch("/api/usuarios/yo").then(setYo).catch(() => {});
    apiFetch("/api/usuarios/meseros").then(setMeseros).catch(() => {});
    // El historial es solo dueño/encargado (el backend devuelve 403 para
    // cajero); si no da 403, mostramos el link.
    apiFetch("/api/turnos")
      .then(() => setPuedeVerHistorial(true))
      .catch(() => {});
    setListo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function abrirFormRetiro() {
    setMostrarFormRetiro(true);
    setMostrarFormEntrega(false);
    setMontoRetiro("");
    setMotivoRetiro("");
    setDetalleRetiro("");
    setPersonaRetira("");
    setPinRetiro("");
    setErrorRetiro("");
    setRetiroCreado(null);
  }

  function abrirFormEntrega() {
    setMostrarFormEntrega(true);
    setMostrarFormRetiro(false);
    setMontoEntrega("");
    setMeseroIdEntrega(meseros[0]?.id || "");
    setNotaEntrega("");
    setErrorEntrega("");
  }

  async function crearEntrega(e) {
    e.preventDefault();
    setErrorEntrega("");
    setEnviandoEntrega(true);
    try {
      await apiFetch(`/api/turnos/${turno.id}/entrega`, {
        method: "POST",
        body: JSON.stringify({
          monto: Number(montoEntrega),
          meseroId: meseroIdEntrega,
          nota: notaEntrega || undefined,
        }),
      });
      setMostrarFormEntrega(false);
      cargarRetiros(turno.id);
    } catch (err) {
      setErrorEntrega(err.message);
    } finally {
      setEnviandoEntrega(false);
    }
  }

  async function crearRetiro(e) {
    e.preventDefault();
    setErrorRetiro("");
    setEnviandoRetiro(true);
    try {
      const nuevo = await apiFetch(`/api/turnos/${turno.id}/retiro`, {
        method: "POST",
        body: JSON.stringify({
          monto: Number(montoRetiro),
          motivo: motivoRetiro,
          motivoDetalle: detalleRetiro || undefined,
          personaRetira,
          pin: yo?.rol === "cajero" ? pinRetiro : undefined,
        }),
      });
      setRetiroCreado(nuevo);
      setMostrarFormRetiro(false);
      cargarRetiros(turno.id);
    } catch (err) {
      setErrorRetiro(err.message);
    } finally {
      setEnviandoRetiro(false);
    }
  }

  const totalRetirado = retiros
    .filter((r) => r.tipo_movimiento !== "entrega")
    .reduce((acumulado, r) => acumulado + Number(r.monto), 0);
  const totalEntregado = retiros
    .filter((r) => r.tipo_movimiento === "entrega")
    .reduce((acumulado, r) => acumulado + Number(r.monto), 0);

  async function abrirCaja() {
    setError("");
    setEnviando(true);
    try {
      const nuevo = await apiFetch("/api/turnos/abrir", {
        method: "POST",
        body: JSON.stringify({ montoInicial: Number(montoInicial) || 0 }),
      });
      setTurno(nuevo);
      setMontoInicial("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function cerrarCaja() {
    setError("");
    setEnviando(true);
    try {
      const cerrado = await apiFetch(`/api/turnos/${turno.id}/cerrar`, {
        method: "POST",
        body: JSON.stringify({ montoDeclarado: Number(montoDeclarado) || 0 }),
      });
      setResultadoCierre(cerrado);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function nuevoTurno() {
    setResultadoCierre(null);
    setTurno(null);
    setMontoDeclarado("");
  }

  if (!listo || turno === undefined) return null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-navy">Caja</h1>
          </div>
          {puedeVerHistorial && (
            <Link href="/caja/historial" className="text-sm font-semibold text-navy hover:text-brand">
              Historial
            </Link>
          )}
        </div>

        {resultadoCierre ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-4 text-center text-lg font-bold text-slate-800">Turno cerrado</p>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-slate-400">Efectivo esperado</span>
              <span className="font-semibold">Gs {formatoGs.format(resultadoCierre.efectivo_esperado)}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-slate-400">Declaraste</span>
              <span className="font-semibold">Gs {formatoGs.format(resultadoCierre.monto_declarado_cierre)}</span>
            </div>
            <div className="mt-4 border-t border-slate-200 pt-4 text-center">
              {Number(resultadoCierre.diferencia) === 0 ? (
                <p className="text-2xl font-extrabold text-emerald-600">Cuadra perfecto</p>
              ) : Number(resultadoCierre.diferencia) > 0 ? (
                <p className="text-2xl font-extrabold text-navy">
                  Sobran Gs {formatoGs.format(resultadoCierre.diferencia)}
                </p>
              ) : (
                <p className="text-2xl font-extrabold text-red-600">
                  Faltan Gs {formatoGs.format(-resultadoCierre.diferencia)}
                </p>
              )}
            </div>
            <Link
              href="/ventas/resumen-dia"
              target="_blank"
              className="mt-4 block w-full rounded-xl bg-navy py-3 text-center font-semibold text-white transition hover:bg-navy-2"
            >
              Ver e imprimir resumen del día
            </Link>
            <button
              onClick={nuevoTurno}
              className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light"
            >
              Abrir nuevo turno
            </button>
          </div>
        ) : !turno ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-4 font-semibold text-slate-700">Abrir caja</p>
            <label className="mb-1 block text-sm font-medium text-slate-700">Monto inicial (Gs)</label>
            <input
              type="number"
              min="0"
              value={montoInicial}
              onChange={(e) => setMontoInicial(e.target.value)}
              placeholder="0"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              onClick={abrirCaja}
              disabled={enviando || montoInicial === ""}
              className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {enviando ? "Abriendo..." : "Abrir caja"}
            </button>
          </div>
        ) : retiroCreado ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-2 text-center text-lg font-bold text-slate-800">Retiro registrado</p>
            {empresaInfo && <ComprobanteRetiro empresa={empresaInfo} retiro={retiroCreado} onNuevoRetiro={abrirFormRetiro} />}
            <button
              onClick={() => setRetiroCreado(null)}
              className="mt-2 w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Volver a la caja
            </button>
          </div>
        ) : mostrarFormRetiro ? (
          <form onSubmit={crearRetiro} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-4 font-semibold text-slate-700">Retiro de efectivo</p>

            <label className="mb-1 block text-sm font-medium text-slate-700">Monto (Gs)</label>
            <input
              type="number"
              min="1"
              required
              value={montoRetiro}
              onChange={(e) => setMontoRetiro(e.target.value)}
              placeholder="0"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            <label className="mb-1 block text-sm font-medium text-slate-700">Motivo</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {MOTIVOS_RETIRO.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => setMotivoRetiro(m.valor)}
                  className={`rounded-xl py-2 text-sm font-semibold transition ${
                    motivoRetiro === m.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {m.etiqueta}
                </button>
              ))}
            </div>

            {motivoRetiro === "otro" && (
              <>
                <label className="mb-1 block text-sm font-medium text-slate-700">Especificá el motivo</label>
                <input
                  required
                  value={detalleRetiro}
                  onChange={(e) => setDetalleRetiro(e.target.value)}
                  className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
              </>
            )}

            <label className="mb-1 block text-sm font-medium text-slate-700">Quién retira o recibe el efectivo</label>
            <input
              required
              value={personaRetira}
              onChange={(e) => setPersonaRetira(e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            {yo?.rol === "cajero" && (
              <>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  PIN de un dueño o encargado (para autorizar)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  value={pinRetiro}
                  onChange={(e) => setPinRetiro(e.target.value)}
                  className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
              </>
            )}

            {errorRetiro && (
              <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorRetiro}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMostrarFormRetiro(false)}
                className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviandoRetiro || !motivoRetiro}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
              >
                {enviandoRetiro ? "Registrando..." : "Registrar retiro"}
              </button>
            </div>
          </form>
        ) : mostrarFormEntrega ? (
          <form onSubmit={crearEntrega} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-4 font-semibold text-slate-700">Entrega de efectivo</p>
            <p className="mb-4 text-sm text-slate-400">
              Registrá el efectivo que un mesero te entregó tras cobrar una mesa.
            </p>

            <label className="mb-1 block text-sm font-medium text-slate-700">Mesero que entrega</label>
            <select
              required
              value={meseroIdEntrega}
              onChange={(e) => setMeseroIdEntrega(e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            >
              <option value="">Elegí un mesero...</option>
              {meseros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-sm font-medium text-slate-700">Monto (Gs)</label>
            <input
              type="number"
              min="1"
              required
              value={montoEntrega}
              onChange={(e) => setMontoEntrega(e.target.value)}
              placeholder="0"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            <label className="mb-1 block text-sm font-medium text-slate-700">Nota (opcional)</label>
            <input
              value={notaEntrega}
              onChange={(e) => setNotaEntrega(e.target.value)}
              placeholder="Ej: cobro Mesa 3"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            {errorEntrega && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorEntrega}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMostrarFormEntrega(false)}
                className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviandoEntrega || !meseroIdEntrega}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
              >
                {enviandoEntrega ? "Registrando..." : "Registrar entrega"}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-1 text-sm text-slate-400">Turno abierto desde</p>
            <p className="mb-4 font-semibold text-slate-800">{formatoFechaHora(turno.abierto_en)}</p>
            <p className="mb-4 text-sm text-slate-500">
              Monto inicial: <span className="font-semibold text-slate-800">Gs {formatoGs.format(turno.monto_inicial)}</span>
            </p>

            <div className="mb-6 rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-500">Movimientos de caja este turno</p>
                <div className="flex gap-3">
                  {meseros.length > 0 && (
                    <button
                      onClick={abrirFormEntrega}
                      className="text-sm font-semibold text-navy hover:text-brand"
                    >
                      + Entrega de efectivo
                    </button>
                  )}
                  <button
                    onClick={abrirFormRetiro}
                    className="text-sm font-semibold text-brand hover:text-navy"
                  >
                    + Retiro de efectivo
                  </button>
                </div>
              </div>
              {retiros.length === 0 ? (
                <p className="text-sm text-slate-400">Sin movimientos registrados.</p>
              ) : (
                <>
                  <div className="flex flex-col divide-y divide-slate-100">
                    {retiros.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-slate-500">
                          {r.tipo_movimiento === "entrega" ? `Entrega de ${r.mesero_nombre}` : r.persona_retira}
                        </span>
                        <span className={`font-semibold ${r.tipo_movimiento === "entrega" ? "text-navy" : "text-slate-700"}`}>
                          {r.tipo_movimiento === "entrega" ? "+" : "−"} Gs {formatoGs.format(r.monto)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                    <span>Total retirado</span>
                    <span>Gs {formatoGs.format(totalRetirado)}</span>
                  </div>
                  {totalEntregado > 0 && (
                    <div className="flex justify-between pt-1 text-sm font-bold text-navy">
                      <span>Total entregado</span>
                      <span>Gs {formatoGs.format(totalEntregado)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contá el efectivo de la caja y poné cuánto hay (Gs)
            </label>
            <input
              type="number"
              min="0"
              value={montoDeclarado}
              onChange={(e) => setMontoDeclarado(e.target.value)}
              placeholder="0"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              onClick={cerrarCaja}
              disabled={enviando || montoDeclarado === ""}
              className="w-full rounded-xl bg-amber-600 py-3 text-lg font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
            >
              {enviando ? "Cerrando..." : "Cerrar caja"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
