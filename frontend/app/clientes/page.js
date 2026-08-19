"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { linkWhatsapp } from "@/lib/whatsapp";
import { construirMensajeRecordatorio, ETIQUETA_CATEGORIA_RECORDATORIO } from "@/lib/recordatorios";

const formatoGs = new Intl.NumberFormat("es-PY");

function colorSaldo(disponible, linea) {
  if (linea <= 0) return "text-slate-400";
  if (disponible <= 0) return "text-red-600";
  if (disponible / linea < 0.2) return "text-amber-600";
  return "text-emerald-600";
}

export default function Clientes() {
  const router = useRouter();
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [yo, setYo] = useState(null);
  const [empresaInfo, setEmpresaInfo] = useState(null);

  // Id del cliente cuya tarjeta de "Recordar pago" esta abierta (solo una
  // a la vez) + el texto del mensaje, editable antes de mandarlo.
  const [recordatorioAbiertoId, setRecordatorioAbiertoId] = useState(null);
  const [textoRecordatorio, setTextoRecordatorio] = useState("");
  const [copiadoId, setCopiadoId] = useState(null);

  const buscar = useCallback(async (q) => {
    setCargando(true);
    setError("");
    try {
      const ruta = q ? `/api/clientes?q=${encodeURIComponent(q)}` : "/api/clientes";
      setClientes(await apiFetch(ruta));
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
    apiFetch("/api/usuarios/yo").then(setYo).catch(() => {});
    apiFetch("/api/empresas/actual").then(setEmpresaInfo).catch(() => {});
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    buscar(busquedaDebounced);
  }, [busquedaDebounced, buscar]);

  function onSubmitBusqueda(e) {
    e.preventDefault();
    buscar(busqueda);
  }

  const puedeRecordar = yo?.rol === "dueno" || yo?.rol === "encargado";

  function abrirRecordatorio(cliente, mensaje) {
    setRecordatorioAbiertoId(cliente.id);
    setTextoRecordatorio(mensaje.texto);
    setCopiadoId(null);
  }

  async function copiarMensaje(clienteId) {
    await navigator.clipboard.writeText(textoRecordatorio);
    setCopiadoId(clienteId);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Fiado / Crédito</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/clientes/importar"
              className="rounded-xl bg-slate-700 px-5 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Importar CSV
            </Link>
            <Link
              href="/clientes/nuevo"
              className="rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white hover:bg-amber-700"
            >
              + Agregar cliente
            </Link>
          </div>
        </div>

        <form onSubmit={onSubmitBusqueda} className="mb-6 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o RUC..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
          />
          <button
            type="submit"
            className="rounded-xl bg-amber-600 px-6 py-3 font-semibold text-white hover:bg-amber-700"
          >
            Buscar
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : clientes.length === 0 ? (
          <p className="text-slate-500">No hay clientes todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {clientes.map((c) => {
              const linea = Number(c.linea_credito);
              const disponible = Number(c.saldo_disponible);
              const mensaje =
                puedeRecordar && empresaInfo ? construirMensajeRecordatorio(c, empresaInfo) : null;
              const recordatorioAbierto = recordatorioAbiertoId === c.id;
              return (
                <div key={c.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-bold text-slate-800">{c.nombre}</p>
                      <p className="text-sm text-slate-400">
                        {[c.documento || "sin documento", c.telefono, c.celular].filter(Boolean).join(" · ")}
                      </p>
                      {(c.email || c.direccion) && (
                        <p className="text-sm text-slate-400">
                          {[c.email, c.direccion].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-extrabold ${colorSaldo(disponible, linea)}`}>
                        Gs {formatoGs.format(disponible)}
                      </p>
                      <p className="text-sm text-slate-400">disponible</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex gap-6 text-sm">
                      <span>
                        <span className="text-slate-400">Línea de crédito </span>
                        <span className="font-semibold">Gs {formatoGs.format(linea)}</span>
                      </span>
                      <span>
                        <span className="text-slate-400">Debe hoy </span>
                        <span className="font-semibold">Gs {formatoGs.format(c.saldo)}</span>
                      </span>
                    </div>
                    <div className="flex gap-4">
                      {mensaje && (
                        <button
                          onClick={() =>
                            recordatorioAbierto ? setRecordatorioAbiertoId(null) : abrirRecordatorio(c, mensaje)
                          }
                          className="text-sm font-semibold text-brand hover:text-navy"
                        >
                          {recordatorioAbierto ? "Cerrar" : `Recordar pago (${ETIQUETA_CATEGORIA_RECORDATORIO[mensaje.categoria]})`}
                        </button>
                      )}
                      {Number(c.saldo) > 0 && (
                        <Link
                          href={`/clientes/${c.id}/cobro`}
                          className="text-sm font-semibold text-amber-600 hover:text-amber-800"
                        >
                          Cobrar
                        </Link>
                      )}
                      <Link
                        href={`/clientes/${c.id}/extracto`}
                        className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Extracto
                      </Link>
                      <Link
                        href={`/clientes/${c.id}/editar`}
                        className="text-sm font-semibold text-navy hover:text-brand"
                      >
                        Editar
                      </Link>
                    </div>
                  </div>

                  {recordatorioAbierto && (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <p className="mb-2 text-sm font-medium text-slate-500">
                        Mensaje ({ETIQUETA_CATEGORIA_RECORDATORIO[mensaje.categoria]}) — podés editarlo antes de mandarlo
                      </p>
                      <textarea
                        value={textoRecordatorio}
                        onChange={(e) => setTextoRecordatorio(e.target.value)}
                        rows={6}
                        className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                      />
                      <div className="flex flex-wrap gap-2">
                        {c.celular ? (
                          <a
                            href={linkWhatsapp(c.celular, textoRecordatorio)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700"
                          >
                            Enviar por WhatsApp
                          </a>
                        ) : (
                          <p className="text-sm text-slate-400">
                            Este cliente no tiene celular cargado — usá "Copiar mensaje" para mandarlo por otro medio.
                          </p>
                        )}
                        <button
                          onClick={() => copiarMensaje(c.id)}
                          className="rounded-xl bg-slate-100 px-5 py-2 font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          {copiadoId === c.id ? "¡Copiado!" : "Copiar mensaje"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
