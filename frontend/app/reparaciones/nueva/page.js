"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";

const TIPOS_SUGERIDOS = ["Celular", "Notebook", "Electrodoméstico", "Tablet", "Otro"];

export default function NuevaReparacion() {
  const router = useRouter();

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [cliente, setCliente] = useState(null);

  const [creandoClienteRapido, setCreandoClienteRapido] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteDocumento, setNuevoClienteDocumento] = useState("");
  const [nuevoClienteCelular, setNuevoClienteCelular] = useState("");
  const [creandoCliente, setCreandoCliente] = useState(false);

  const [tipoEquipo, setTipoEquipo] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
  const [accesorios, setAccesorios] = useState("");
  const [estadoRecibido, setEstadoRecibido] = useState("");
  const [comentarioCliente, setComentarioCliente] = useState("");
  const [notaInterna, setNotaInterna] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
    }
  }, [router]);

  async function ejecutarBusquedaCliente(q) {
    if (!q) {
      setResultadosCliente([]);
      return;
    }
    try {
      setResultadosCliente(await apiFetch(`/api/clientes?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function buscarCliente(e) {
    e.preventDefault();
    ejecutarBusquedaCliente(busquedaCliente);
  }

  const busquedaClienteDebounced = useDebounced(busquedaCliente);
  useEffect(() => {
    ejecutarBusquedaCliente(busquedaClienteDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaClienteDebounced]);

  function seleccionarCliente(c) {
    setCliente(c);
    setResultadosCliente([]);
    setBusquedaCliente("");
    setCreandoClienteRapido(false);
  }

  function abrirClienteRapido() {
    setCreandoClienteRapido(true);
    setNuevoClienteNombre(busquedaCliente);
    setNuevoClienteDocumento("");
    setNuevoClienteCelular("");
  }

  async function crearClienteRapido(e) {
    e.preventDefault();
    setError("");
    setCreandoCliente(true);
    try {
      const nuevoCliente = await apiFetch("/api/clientes", {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevoClienteNombre,
          documento: nuevoClienteDocumento || undefined,
          celular: nuevoClienteCelular || undefined,
        }),
      });
      seleccionarCliente(nuevoCliente);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreandoCliente(false);
    }
  }

  const puedeGuardar = !!cliente && tipoEquipo.trim() && estadoRecibido.trim() && !enviando;

  async function guardar(e) {
    e.preventDefault();
    if (!puedeGuardar) return;
    setError("");
    setEnviando(true);
    try {
      const reparacion = await apiFetch("/api/reparaciones", {
        method: "POST",
        body: JSON.stringify({
          clienteId: cliente.id,
          tipoEquipo,
          marca: marca || undefined,
          modelo: modelo || undefined,
          numeroSerie: numeroSerie || undefined,
          accesorios: accesorios || undefined,
          estadoRecibido,
          comentarioCliente: comentarioCliente || undefined,
          notaInterna: notaInterna || undefined,
        }),
      });
      // El cliente esta ahi esperando su copia - se navega directo al
      // detalle, que ya imprime sola la primera vez (ver reparaciones/[id]).
      router.push(`/reparaciones/${reparacion.id}?imprimir=1`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/reparaciones" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Nueva recepción</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Cliente</p>
          {cliente ? (
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">{cliente.nombre}</p>
              <button onClick={() => setCliente(null)} className="text-sm font-medium text-red-500 hover:text-red-700">
                Quitar
              </button>
            </div>
          ) : (
            <div>
              <form onSubmit={buscarCliente} className="flex gap-2">
                <input
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  placeholder="Buscar por nombre, cédula o RUC..."
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
                  Buscar
                </button>
              </form>
              {resultadosCliente.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {resultadosCliente.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => seleccionarCliente(c)}
                      className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold">{c.nombre}</span>{" "}
                      <span className="text-sm text-slate-400">{c.documento}</span>
                    </button>
                  ))}
                </div>
              )}

              {creandoClienteRapido ? (
                <form
                  onSubmit={crearClienteRapido}
                  onKeyDown={avanzarConEnter}
                  className="mt-3 rounded-xl border border-slate-200 p-3"
                >
                  <p className="mb-2 text-sm font-semibold text-slate-700">Cliente nuevo</p>
                  <input
                    value={nuevoClienteDocumento}
                    onChange={(e) => setNuevoClienteDocumento(e.target.value)}
                    placeholder="Cédula/RUC (opcional)"
                    autoFocus
                    className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                  <input
                    required
                    value={nuevoClienteNombre}
                    onChange={(e) => setNuevoClienteNombre(e.target.value)}
                    placeholder="Nombre y apellido"
                    className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                  <input
                    value={nuevoClienteCelular}
                    onChange={(e) => setNuevoClienteCelular(e.target.value)}
                    placeholder="Celular / WhatsApp (opcional)"
                    className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCreandoClienteRapido(false)}
                      className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creandoCliente}
                      className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                    >
                      {creandoCliente ? "Creando..." : "Crear y usar este cliente"}
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={abrirClienteRapido} className="mt-3 text-sm font-semibold text-navy hover:text-brand">
                  + Crear cliente nuevo
                </button>
              )}
            </div>
          )}
        </div>

        <form onSubmit={guardar} onKeyDown={avanzarConEnter} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">El equipo</p>

          <label className="mb-1 block text-sm font-medium text-slate-500">Tipo de equipo</label>
          <input
            value={tipoEquipo}
            onChange={(e) => setTipoEquipo(e.target.value)}
            placeholder="Celular, notebook, electrodoméstico..."
            className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
          <div className="mb-4 flex flex-wrap gap-2">
            {TIPOS_SUGERIDOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoEquipo(t)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-500">Marca</label>
              <input
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-500">Modelo</label>
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
          </div>

          <label className="mb-1 block text-sm font-medium text-slate-500">N° de serie / IMEI (opcional)</label>
          <input
            value={numeroSerie}
            onChange={(e) => setNumeroSerie(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          <label className="mb-1 block text-sm font-medium text-slate-500">Accesorios entregados</label>
          <input
            value={accesorios}
            onChange={(e) => setAccesorios(e.target.value)}
            placeholder="Ej: cargador, funda"
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          <label className="mb-1 block text-sm font-medium text-slate-500">Estado del equipo al recibir</label>
          <textarea
            value={estadoRecibido}
            onChange={(e) => setEstadoRecibido(e.target.value)}
            placeholder="Ej: pantalla con rayones, sin funda"
            rows={3}
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          <label className="mb-1 block text-sm font-medium text-slate-500">Comentario del cliente (opcional)</label>
          <textarea
            value={comentarioCliente}
            onChange={(e) => setComentarioCliente(e.target.value)}
            placeholder="Ej: no enciende hace 2 días"
            rows={2}
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          <label className="mb-1 block text-sm font-medium text-slate-500">Nota interna (opcional, no se imprime)</label>
          <textarea
            value={notaInterna}
            onChange={(e) => setNotaInterna(e.target.value)}
            rows={2}
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={!puedeGuardar}
            className="w-full rounded-xl bg-brand py-4 text-lg font-bold text-white hover:bg-brand-light disabled:opacity-60"
          >
            {enviando ? "Guardando..." : "Registrar recepción"}
          </button>
        </form>
      </div>
    </main>
  );
}
