"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

function fecha(f) {
  return f ? new Date(f).toLocaleDateString("es-PY") : "—";
}
function fechaHora(f) {
  return new Date(f).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ESTILO_ESTADO_CITA = {
  pendiente: "bg-amber-100 text-amber-700",
  atendida: "bg-emerald-100 text-emerald-700",
  no_asistio: "bg-slate-100 text-slate-500",
  cancelada: "bg-red-100 text-red-700",
};
const ESTILO_ESTADO_INTERNACION = {
  internado: "bg-amber-100 text-amber-700",
  dado_de_alta: "bg-emerald-100 text-emerald-700",
};

export default function FichaMascota() {
  const router = useRouter();
  const { id } = useParams();

  const [mascota, setMascota] = useState(null);
  const [error, setError] = useState("");

  const [nombreVacuna, setNombreVacuna] = useState("");
  const [fechaAplicacion, setFechaAplicacion] = useState(new Date().toISOString().slice(0, 10));
  const [fechaProximoRefuerzo, setFechaProximoRefuerzo] = useState("");
  const [notaVacuna, setNotaVacuna] = useState("");
  const [cargandoVacuna, setCargandoVacuna] = useState(false);

  const [resultadosEditando, setResultadosEditando] = useState({});
  const [guardandoResultado, setGuardandoResultado] = useState("");

  async function cargar() {
    try {
      setMascota(await apiFetch(`/api/mascotas/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  async function agregarVacuna(e) {
    e.preventDefault();
    setError("");
    setCargandoVacuna(true);
    try {
      await apiFetch(`/api/mascotas/${id}/vacunas`, {
        method: "POST",
        body: JSON.stringify({
          nombreVacuna,
          fechaAplicacion,
          fechaProximoRefuerzo: fechaProximoRefuerzo || undefined,
          nota: notaVacuna || undefined,
        }),
      });
      setNombreVacuna("");
      setFechaProximoRefuerzo("");
      setNotaVacuna("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoVacuna(false);
    }
  }

  async function guardarResultado(citaId) {
    setGuardandoResultado(citaId);
    setError("");
    try {
      await apiFetch(`/api/citas/${citaId}/resultado`, {
        method: "PATCH",
        body: JSON.stringify({ resultado: resultadosEditando[citaId] ?? "" }),
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoResultado("");
    }
  }

  if (error && !mascota) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }
  if (!mascota) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  const campo = "w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/mascotas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">
            {mascota.nombre} <span className="text-lg font-normal text-slate-400">· {mascota.especie}{mascota.raza ? ` · ${mascota.raza}` : ""}</span>
          </h1>
          <p className="text-sm text-slate-400">
            Dueño: {mascota.cliente_nombre} · {mascota.cliente_celular || "sin celular"}
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-400">Nacimiento</p>
              <p className="font-semibold text-slate-700">{fecha(mascota.fecha_nacimiento)}</p>
            </div>
            <div>
              <p className="text-slate-400">Sexo</p>
              <p className="font-semibold text-slate-700">{mascota.sexo || "—"}</p>
            </div>
            <div>
              <p className="text-slate-400">Peso</p>
              <p className="font-semibold text-slate-700">{mascota.peso_kg ? `${mascota.peso_kg} kg` : "—"}</p>
            </div>
          </div>
          {mascota.notas && (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-semibold">Notas</p>
              <p>{mascota.notas}</p>
            </div>
          )}
          <Link
            href={`/internaciones/nueva?mascotaId=${mascota.id}`}
            className="mt-4 block w-full rounded-xl bg-brand py-3 text-center font-semibold text-white hover:bg-brand-light"
          >
            🏥 Nueva internación
          </Link>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <h2 className="mb-3 text-lg font-bold text-navy">Vacunación</h2>

          {mascota.vacunas.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {mascota.vacunas.map((v) => (
                <div key={v.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold text-slate-800">{v.nombre_vacuna}</p>
                  <p className="text-sm text-slate-400">
                    Aplicada el {fecha(v.fecha_aplicacion)}
                    {v.fecha_proximo_refuerzo && ` · Próximo refuerzo: ${fecha(v.fecha_proximo_refuerzo)}`}
                  </p>
                  {v.nota && <p className="mt-1 text-sm text-slate-600">{v.nota}</p>}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={agregarVacuna} className="rounded-xl border border-dashed border-slate-300 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-600">Registrar vacuna aplicada</p>
            <input
              required
              value={nombreVacuna}
              onChange={(e) => setNombreVacuna(e.target.value)}
              placeholder="Nombre de la vacuna"
              className={`${campo} mb-2`}
            />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Fecha de aplicación</label>
                <input
                  required
                  type="date"
                  value={fechaAplicacion}
                  onChange={(e) => setFechaAplicacion(e.target.value)}
                  className={campo}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Próximo refuerzo (opcional)</label>
                <input
                  type="date"
                  value={fechaProximoRefuerzo}
                  onChange={(e) => setFechaProximoRefuerzo(e.target.value)}
                  className={campo}
                />
              </div>
            </div>
            <input
              value={notaVacuna}
              onChange={(e) => setNotaVacuna(e.target.value)}
              placeholder="Nota (opcional)"
              className={`${campo} mb-2`}
            />
            <button
              type="submit"
              disabled={cargandoVacuna}
              className="w-full rounded-lg bg-navy py-2 font-semibold text-white hover:bg-navy-2 disabled:opacity-60"
            >
              {cargandoVacuna ? "Guardando..." : "+ Agregar vacuna"}
            </button>
          </form>
        </div>

        {mascota.internaciones.length > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <h2 className="mb-3 text-lg font-bold text-navy">Internaciones</h2>
            <div className="flex flex-col gap-2">
              {mascota.internaciones.map((i) => (
                <Link
                  key={i.id}
                  href={`/internaciones/${i.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-semibold text-slate-800">N° {i.numero} · {i.motivo}</p>
                    <p className="text-sm text-slate-400">Ingresó el {fechaHora(i.fecha_ingreso)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${ESTILO_ESTADO_INTERNACION[i.estado]}`}>
                    {i.estado === "internado" ? "Internado" : "Dado de alta"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <h2 className="mb-3 text-lg font-bold text-navy">Tratamientos y análisis (citas)</h2>
          {mascota.citas.length === 0 ? (
            <p className="text-sm text-slate-400">
              Sin citas vinculadas todavía —{" "}
              <Link href="/citas/nueva" className="font-semibold text-navy hover:text-brand">
                agendá una
              </Link>{" "}
              y elegí esta mascota.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {mascota.citas.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{c.producto_nombre}</p>
                      <p className="text-sm text-slate-400">
                        {fechaHora(c.fecha_hora_inicio)} · {c.profesional_nombre}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${ESTILO_ESTADO_CITA[c.estado]}`}>
                      {c.estado === "no_asistio" ? "No asistió" : c.estado}
                    </span>
                  </div>
                  <label className="mb-1 mt-3 block text-xs text-slate-400">
                    Resultado / evolución (análisis de laboratorio, cómo respondió al tratamiento, etc.)
                  </label>
                  <textarea
                    value={resultadosEditando[c.id] ?? c.resultado ?? ""}
                    onChange={(e) => setResultadosEditando((actual) => ({ ...actual, [c.id]: e.target.value }))}
                    rows={2}
                    className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy"
                  />
                  <button
                    onClick={() => guardarResultado(c.id)}
                    disabled={guardandoResultado === c.id}
                    className="rounded-lg bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                  >
                    {guardandoResultado === c.id ? "Guardando..." : "Guardar resultado"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
