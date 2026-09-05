"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";

function ahoraRedondeadoISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - (d.getMinutes() % 15) + 15, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// useSearchParams() exige un limite de Suspense arriba, mismo criterio
// ya usado en stock/traslados/nuevo.
export default function NuevaCita() {
  return (
    <Suspense fallback={null}>
      <NuevaCitaContenido />
    </Suspense>
  );
}

function NuevaCitaContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [cliente, setCliente] = useState(null);

  const [busquedaServicio, setBusquedaServicio] = useState("");
  const [resultadosServicio, setResultadosServicio] = useState([]);
  const [servicio, setServicio] = useState(null);
  const [duracionMinutos, setDuracionMinutos] = useState("");

  const [profesionales, setProfesionales] = useState([]);
  const [profesionalId, setProfesionalId] = useState("");

  const [fechaHoraInicio, setFechaHoraInicio] = useState(ahoraRedondeadoISO());
  const [nota, setNota] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/citas/profesionales?activo=true")
      .then((lista) => {
        setProfesionales(lista);
        const pedido = searchParams.get("profesionalId");
        setProfesionalId((pedido && lista.some((p) => p.id === pedido)) ? pedido : lista[0]?.id || "");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function ejecutarBusquedaCliente(q) {
    if (!q) return setResultadosCliente([]);
    try {
      setResultadosCliente(await apiFetch(`/api/clientes?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }
  const busquedaClienteDebounced = useDebounced(busquedaCliente);
  useEffect(() => {
    ejecutarBusquedaCliente(busquedaClienteDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaClienteDebounced]);

  async function ejecutarBusquedaServicio(q) {
    if (!q) return setResultadosServicio([]);
    try {
      setResultadosServicio(await apiFetch(`/api/productos?soloServicios=true&q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }
  const busquedaServicioDebounced = useDebounced(busquedaServicio);
  useEffect(() => {
    ejecutarBusquedaServicio(busquedaServicioDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaServicioDebounced]);

  const horaFin =
    servicio && fechaHoraInicio && Number(duracionMinutos) > 0
      ? new Date(new Date(fechaHoraInicio).getTime() + Number(duracionMinutos) * 60000).toLocaleTimeString("es-PY", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  const puedeConfirmar = cliente && servicio && profesionalId && fechaHoraInicio && Number(duracionMinutos) > 0;

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      await apiFetch("/api/citas", {
        method: "POST",
        body: JSON.stringify({
          clienteId: cliente.id,
          productoId: servicio.id,
          profesionalId,
          fechaHoraInicio: new Date(fechaHoraInicio).toISOString(),
          duracionMinutos: Number(duracionMinutos),
          nota: nota || undefined,
        }),
      });
      router.push("/citas");
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";
  const formatoGs = new Intl.NumberFormat("es-PY");

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/citas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a la agenda
          </Link>
          <h1 className="text-2xl font-bold text-navy">Nueva cita</h1>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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
              <input
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                placeholder="Buscar por nombre, cédula o RUC..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              {resultadosCliente.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {resultadosCliente.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCliente(c);
                        setResultadosCliente([]);
                        setBusquedaCliente("");
                      }}
                      className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold">{c.nombre}</span>{" "}
                      <span className="text-sm text-slate-400">{c.documento}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                ¿No está cargado? <Link href="/clientes/nuevo" className="font-semibold text-navy hover:text-brand">Creá el cliente</Link> y volvé acá.
              </p>
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Servicio</p>
          {servicio ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">
                  {servicio.nombre} · Gs {formatoGs.format(servicio.precio_contado)}
                </p>
                <button onClick={() => setServicio(null)} className="text-sm font-medium text-red-500 hover:text-red-700">
                  Quitar
                </button>
              </div>
              <label className="mb-1 mt-3 block text-sm font-medium text-slate-700">Duración aproximada (minutos)</label>
              <input
                type="number"
                min="1"
                value={duracionMinutos}
                onChange={(e) => setDuracionMinutos(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              <p className="mt-1 text-xs text-slate-400">
                Precargada del servicio — ajustala si esta atención en particular va a llevar más o menos tiempo.
              </p>
            </div>
          ) : (
            <div>
              <input
                value={busquedaServicio}
                onChange={(e) => setBusquedaServicio(e.target.value)}
                placeholder="Buscar servicio..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              {resultadosServicio.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {resultadosServicio.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setServicio(p);
                        setDuracionMinutos(String(p.duracion_minutos));
                        setResultadosServicio([]);
                        setBusquedaServicio("");
                      }}
                      className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold">{p.nombre}</span>{" "}
                      <span className="text-sm text-slate-400">
                        {p.duracion_minutos} min · Gs {formatoGs.format(p.precio_contado)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {busquedaServicioDebounced && resultadosServicio.length === 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Sin resultados — marcá el producto como "Es un servicio" desde Stock para que aparezca acá.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200" onKeyDown={avanzarConEnter}>
          <label className={etiqueta}>Profesional</label>
          <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className={campo}>
            {profesionales.length === 0 && <option value="">Sin profesionales cargados</option>}
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          <label className={etiqueta}>Fecha y hora</label>
          <input
            type="datetime-local"
            value={fechaHoraInicio}
            onChange={(e) => setFechaHoraInicio(e.target.value)}
            className={campo}
          />
          {servicio && horaFin && (
            <p className="-mt-3 mb-4 text-sm text-slate-500">
              Dura {duracionMinutos} minutos — hasta las {horaFin}.
            </p>
          )}

          <label className={etiqueta}>Nota (opcional)</label>
          <input value={nota} onChange={(e) => setNota(e.target.value)} className={campo} placeholder="Ej: pidió el mismo tono que la vez pasada" />
        </div>

        <button
          onClick={confirmar}
          disabled={!puedeConfirmar || enviando}
          className="w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
        >
          {enviando ? "Reservando..." : "Reservar cita"}
        </button>
        {profesionales.length === 0 && (
          <p className="mt-3 text-center text-sm text-slate-400">
            Primero cargá un{" "}
            <Link href="/citas/profesionales" className="font-semibold text-navy hover:text-brand">
              profesional
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
