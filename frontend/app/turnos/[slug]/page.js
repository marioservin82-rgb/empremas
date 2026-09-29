"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const formatoGs = new Intl.NumberFormat("es-PY");

// Franja fija de 8 a 19hs, cada 30 min - no existe hoy un "horario de
// atención" configurable por salón (ver plan, "Fuera de alcance").
function generarHorariosCandidatos() {
  const horarios = [];
  for (let h = 8; h < 19; h++) {
    horarios.push(`${String(h).padStart(2, "0")}:00`);
    horarios.push(`${String(h).padStart(2, "0")}:30`);
  }
  return horarios;
}
const HORARIOS_CANDIDATOS = generarHorariosCandidatos();

function fechaHoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function seSuperponen(inicioA, finA, inicioB, finB) {
  return inicioA < finB && finA > inicioB;
}

export default function ReservaPublica() {
  const { slug } = useParams();

  const [salon, setSalon] = useState(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [cargandoSalon, setCargandoSalon] = useState(true);

  const [paso, setPaso] = useState(1);
  const [error, setError] = useState("");

  const [servicios, setServicios] = useState([]);
  const [servicioElegido, setServicioElegido] = useState(null);

  const [profesionales, setProfesionales] = useState([]);
  const [profesionalElegidoId, setProfesionalElegidoId] = useState(""); // "" = Cualquiera disponible

  const [fecha, setFecha] = useState(fechaHoyISO());
  const [ocupadasPorProfesional, setOcupadasPorProfesional] = useState({});
  const [cargandoHorarios, setCargandoHorarios] = useState(false);
  const [slotElegido, setSlotElegido] = useState(null); // { hora, profesionalId, fechaHoraInicio }

  const [nombreCliente, setNombreCliente] = useState("");
  const [celular, setCelular] = useState("");
  const [consentimiento, setConsentimiento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    fetch(`${BASE_URL}/api/publico/salon/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("no encontrado");
        return r.json();
      })
      .then(setSalon)
      .catch(() => setNoEncontrado(true))
      .finally(() => setCargandoSalon(false));
  }, [slug]);

  useEffect(() => {
    if (!salon) return;
    fetch(`${BASE_URL}/api/publico/salon/${slug}/servicios`)
      .then((r) => r.json())
      .then(setServicios)
      .catch(() => {});
    fetch(`${BASE_URL}/api/publico/salon/${slug}/profesionales`)
      .then((r) => r.json())
      .then(setProfesionales)
      .catch(() => {});
  }, [salon, slug]);

  async function cargarDisponibilidad() {
    setCargandoHorarios(true);
    setSlotElegido(null);
    try {
      const candidatos = profesionalElegidoId
        ? profesionales.filter((p) => p.id === profesionalElegidoId)
        : profesionales;
      const resultados = await Promise.all(
        candidatos.map((p) =>
          fetch(`${BASE_URL}/api/publico/salon/${slug}/disponibilidad?profesionalId=${p.id}&fecha=${fecha}`)
            .then((r) => r.json())
            .then((ocupadas) => [p.id, ocupadas])
        )
      );
      setOcupadasPorProfesional(Object.fromEntries(resultados));
    } catch {
      setOcupadasPorProfesional({});
    } finally {
      setCargandoHorarios(false);
    }
  }

  useEffect(() => {
    if (paso === 3 && profesionales.length > 0) cargarDisponibilidad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, fecha, profesionalElegidoId, profesionales.length]);

  const duracionMinutos = servicioElegido?.duracion_minutos || 30;

  // Para cada horario candidato, el primer profesional libre (o el elegido
  // puntual, si no dejó "Cualquiera disponible") en ese horario.
  const slotsDisponibles = useMemo(() => {
    const candidatos = profesionalElegidoId
      ? profesionales.filter((p) => p.id === profesionalElegidoId)
      : profesionales;
    return HORARIOS_CANDIDATOS.map((hora) => {
      const inicio = new Date(`${fecha}T${hora}:00`);
      const fin = new Date(inicio.getTime() + duracionMinutos * 60000);
      const libre = candidatos.find((p) => {
        const ocupadas = ocupadasPorProfesional[p.id] || [];
        return !ocupadas.some((o) => {
          const oInicio = new Date(o.fecha_hora_inicio);
          const oFin = new Date(oInicio.getTime() + o.duracion_minutos * 60000);
          return seSuperponen(inicio, fin, oInicio, oFin);
        });
      });
      return { hora, profesionalId: libre?.id || null, fechaHoraInicio: inicio.toISOString() };
    });
  }, [fecha, duracionMinutos, ocupadasPorProfesional, profesionalElegidoId, profesionales]);

  async function confirmarReserva() {
    setEnviando(true);
    setError("");
    try {
      const resp = await fetch(`${BASE_URL}/api/publico/salon/${slug}/citas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreCliente,
          celular,
          consentimiento,
          servicioId: servicioElegido.id,
          profesionalId: slotElegido.profesionalId,
          fechaHoraInicio: slotElegido.fechaHoraInicio,
        }),
      });
      const datos = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(datos.error || "No se pudo reservar");
      setResultado(datos);
      setPaso(5);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoSalon) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-cream p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  if (noEncontrado || !salon) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-cream p-6">
        <p className="max-w-sm text-center text-slate-500">
          Esta página no está disponible. Si tenés dudas, contactá directamente al salón.
        </p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-1 flex-col items-center overflow-hidden bg-cream p-6">
      {salon.logo && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            backgroundImage: `url(${salon.logo})`,
            backgroundSize: "160%",
            backgroundPosition: "center",
            filter: "blur(60px)",
          }}
        />
      )}
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {salon.logo && (
            <img
              src={salon.logo}
              alt={salon.nombre}
              className="mb-3 h-32 w-32 rounded-full object-cover shadow-lg ring-4 ring-white"
            />
          )}
          <h1 className="text-2xl font-bold text-navy">{salon.nombre}</h1>
          <p className="text-sm text-slate-500">Reservá tu turno online</p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {paso === 1 && (
          <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Elegí el servicio</p>
            {servicios.length === 0 ? (
              <p className="text-sm text-slate-400">Todavía no hay servicios cargados.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {servicios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setServicioElegido(s);
                      setPaso(2);
                    }}
                    className="overflow-hidden rounded-xl border border-slate-200 text-left hover:border-brand hover:bg-brand/5"
                  >
                    {s.fotos?.[0] && (
                      <img src={s.fotos[0]} alt="" className="h-40 w-full object-cover" />
                    )}
                    <div className="p-3">
                      <p className="font-semibold text-slate-800">{s.nombre}</p>
                      <p className="text-sm text-slate-500">
                        Gs {formatoGs.format(s.precio_contado)}
                        {s.duracion_minutos ? ` · ${s.duracion_minutos} min` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {paso === 2 && (
          <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">¿Con quién?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setProfesionalElegidoId("");
                  setPaso(3);
                }}
                className="rounded-xl border border-slate-200 p-3 text-left font-semibold text-slate-700 hover:border-brand hover:bg-brand/5"
              >
                Cualquiera disponible
              </button>
              {profesionales.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProfesionalElegidoId(p.id);
                    setPaso(3);
                  }}
                  className="rounded-xl border border-slate-200 p-3 text-left font-semibold text-slate-700 hover:border-brand hover:bg-brand/5"
                >
                  {p.nombre}
                </button>
              ))}
            </div>
            <button onClick={() => setPaso(1)} className="mt-4 text-sm font-semibold text-slate-500 hover:text-slate-700">
              ← Volver
            </button>
          </div>
        )}

        {paso === 3 && (
          <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Elegí día y horario</p>
            <input
              type="date"
              value={fecha}
              min={fechaHoyISO()}
              onChange={(e) => setFecha(e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
            {cargandoHorarios ? (
              <p className="text-sm text-slate-400">Buscando horarios libres...</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slotsDisponibles.map((s) => (
                  <button
                    key={s.hora}
                    disabled={!s.profesionalId}
                    onClick={() => setSlotElegido(s)}
                    className={`rounded-xl py-2 text-sm font-semibold transition ${
                      !s.profesionalId
                        ? "cursor-not-allowed bg-slate-50 text-slate-300 line-through"
                        : slotElegido?.hora === s.hora
                        ? "bg-navy text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {s.hora}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setPaso(2)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
                ← Volver
              </button>
              <button
                onClick={() => slotElegido && setPaso(4)}
                disabled={!slotElegido}
                className="ml-auto rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-light disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {paso === 4 && (
          <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Tus datos</p>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre y apellido</label>
            <input
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              placeholder="Ej: María López"
            />
            <label className="mb-1 block text-sm font-medium text-slate-700">Celular</label>
            <input
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              inputMode="tel"
              className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              placeholder="Ej: 0981 234 567"
            />
            <label className="mb-4 flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={consentimiento}
                onChange={(e) => setConsentimiento(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              Acepto que el salón guarde mis datos para gestionar mi cita.
            </label>
            <div className="flex gap-2">
              <button onClick={() => setPaso(3)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
                ← Volver
              </button>
              <button
                onClick={confirmarReserva}
                disabled={enviando || !nombreCliente.trim() || !celular.trim() || !consentimiento}
                className="ml-auto rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-light disabled:opacity-50"
              >
                {enviando ? "Reservando..." : "Confirmar reserva"}
              </button>
            </div>
          </div>
        )}

        {paso === 5 && resultado && (
          <div className="rounded-2xl bg-white p-6 text-center shadow shadow-slate-200">
            <p className="mb-2 text-3xl">✅</p>
            <p className="mb-1 text-lg font-bold text-slate-800">¡Reserva confirmada!</p>
            <p className="mb-4 text-sm text-slate-500">
              {servicioElegido?.nombre} el{" "}
              {new Date(resultado.fechaHoraInicio).toLocaleDateString("es-PY")} a las{" "}
              {new Date(resultado.fechaHoraInicio).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="text-xs text-slate-400">Te esperamos en {salon.nombre}.</p>
          </div>
        )}
      </div>
    </main>
  );
}
