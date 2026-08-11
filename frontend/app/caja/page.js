"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

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

  async function cargarTurno() {
    try {
      setTurno(await apiFetch("/api/turnos/actual"));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargarTurno();
    // El historial es solo dueño/encargado (el backend devuelve 403 para
    // cajero); si no da 403, mostramos el link.
    apiFetch("/api/turnos")
      .then(() => setPuedeVerHistorial(true))
      .catch(() => {});
    setListo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
            <h1 className="mt-2 text-2xl font-bold text-blue-900">Caja</h1>
          </div>
          {puedeVerHistorial && (
            <Link href="/caja/historial" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
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
                <p className="text-2xl font-extrabold text-blue-700">
                  Sobran Gs {formatoGs.format(resultadoCierre.diferencia)}
                </p>
              ) : (
                <p className="text-2xl font-extrabold text-red-600">
                  Faltan Gs {formatoGs.format(-resultadoCierre.diferencia)}
                </p>
              )}
            </div>
            <button
              onClick={nuevoTurno}
              className="mt-6 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white transition hover:bg-blue-800"
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
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              onClick={abrirCaja}
              disabled={enviando || montoInicial === ""}
              className="w-full rounded-xl bg-emerald-700 py-3 text-lg font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {enviando ? "Abriendo..." : "Abrir caja"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-1 text-sm text-slate-400">Turno abierto desde</p>
            <p className="mb-4 font-semibold text-slate-800">{formatoFechaHora(turno.abierto_en)}</p>
            <p className="mb-6 text-sm text-slate-500">
              Monto inicial: <span className="font-semibold text-slate-800">Gs {formatoGs.format(turno.monto_inicial)}</span>
            </p>

            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contá el efectivo de la caja y poné cuánto hay (Gs)
            </label>
            <input
              type="number"
              min="0"
              value={montoDeclarado}
              onChange={(e) => setMontoDeclarado(e.target.value)}
              placeholder="0"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
