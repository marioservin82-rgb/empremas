"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";

const MOTIVOS_SUGERIDOS = ["Hospedaje", "Tratamiento médico", "Cirugía / posoperatorio", "Observación"];

// useSearchParams() exige un limite de Suspense arriba, mismo criterio ya
// usado en citas/nueva y mascotas/nueva.
export default function NuevaInternacion() {
  return (
    <Suspense fallback={null}>
      <NuevaInternacionContenido />
    </Suspense>
  );
}

function NuevaInternacionContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busquedaMascota, setBusquedaMascota] = useState("");
  const [resultadosMascota, setResultadosMascota] = useState([]);
  const [mascota, setMascota] = useState(null);

  const [motivo, setMotivo] = useState("");
  const [tarifaDiaria, setTarifaDiaria] = useState("");
  const [notaIngreso, setNotaIngreso] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    const mascotaIdPrecargada = searchParams.get("mascotaId");
    if (mascotaIdPrecargada) {
      apiFetch(`/api/mascotas/${mascotaIdPrecargada}`)
        .then(setMascota)
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function ejecutarBusquedaMascota(q) {
    if (!q) return setResultadosMascota([]);
    try {
      setResultadosMascota(await apiFetch(`/api/mascotas?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }
  const busquedaMascotaDebounced = useDebounced(busquedaMascota);
  useEffect(() => {
    ejecutarBusquedaMascota(busquedaMascotaDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaMascotaDebounced]);

  const puedeConfirmar = mascota && motivo.trim();

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const internacion = await apiFetch("/api/internaciones", {
        method: "POST",
        body: JSON.stringify({
          mascotaId: mascota.id,
          motivo: motivo.trim(),
          tarifaDiaria: tarifaDiaria ? Number(tarifaDiaria) : undefined,
          notaIngreso: notaIngreso || undefined,
        }),
      });
      router.push(`/internaciones/${internacion.id}`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/internaciones" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Nuevo ingreso</h1>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Mascota</p>
          {mascota ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">
                  {mascota.nombre} <span className="text-sm font-normal text-slate-400">· {mascota.especie}</span>
                </p>
                <p className="text-sm text-slate-400">Dueño: {mascota.cliente_nombre}</p>
              </div>
              <button onClick={() => setMascota(null)} className="text-sm font-medium text-red-500 hover:text-red-700">
                Quitar
              </button>
            </div>
          ) : (
            <div>
              <input
                value={busquedaMascota}
                onChange={(e) => setBusquedaMascota(e.target.value)}
                placeholder="Buscar por nombre de la mascota o del dueño..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              {resultadosMascota.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {resultadosMascota.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMascota(m);
                        setResultadosMascota([]);
                        setBusquedaMascota("");
                      }}
                      className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold">{m.nombre}</span>{" "}
                      <span className="text-sm text-slate-400">
                        {m.especie} · dueño: {m.cliente_nombre}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                ¿No está registrada?{" "}
                <Link href="/mascotas/nueva" className="font-semibold text-navy hover:text-brand">
                  Registrala
                </Link>{" "}
                y volvé acá.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200" onKeyDown={avanzarConEnter}>
          <label className={etiqueta}>Motivo del ingreso</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Hospedaje, tratamiento médico..." />
          <div className="-mt-3 mb-4 flex flex-wrap gap-2">
            {MOTIVOS_SUGERIDOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                {m}
              </button>
            ))}
          </div>

          <label className={etiqueta}>Tarifa diaria en Gs (opcional)</label>
          <input
            type="number"
            min="0"
            value={tarifaDiaria}
            onChange={(e) => setTarifaDiaria(e.target.value)}
            className={campo}
            placeholder="Referencia — el total se carga al dar de alta"
          />

          <label className={etiqueta}>Nota de ingreso (opcional)</label>
          <textarea
            value={notaIngreso}
            onChange={(e) => setNotaIngreso(e.target.value)}
            rows={3}
            className="mb-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            placeholder="Estado al ingresar, indicaciones del dueño, etc."
          />
        </div>

        <button
          onClick={confirmar}
          disabled={!puedeConfirmar || enviando}
          className="mt-4 w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
        >
          {enviando ? "Registrando..." : "Registrar ingreso"}
        </button>
      </div>
    </main>
  );
}
