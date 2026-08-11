"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function Sucursales() {
  const router = useRouter();
  const [sucursales, setSucursales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [puntoExpedicion, setPuntoExpedicion] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    return apiFetch("/api/sucursales")
      .then(setSucursales)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function crear() {
    setError("");
    if (!nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/api/sucursales", {
        method: "POST",
        body: JSON.stringify({ nombre, direccion: direccion || undefined, puntoExpedicion: puntoExpedicion || undefined }),
      });
      setNombre("");
      setDireccion("");
      setPuntoExpedicion("");
      setCreando(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActiva(id, activa) {
    setError("");
    try {
      await apiFetch(`/api/sucursales/${id}`, { method: "PATCH", body: JSON.stringify({ activa }) });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/empleados" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-blue-900">Sucursales</h1>
          </div>
          {!creando && (
            <button
              onClick={() => setCreando(true)}
              className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
            >
              + Agregar sucursal
            </button>
          )}
        </div>

        {creando && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Sucursal Villa Hayes"
              className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            <label className="mb-1 block text-sm font-medium text-slate-700">Dirección (opcional)</label>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            <label className="mb-1 block text-sm font-medium text-slate-700">Punto de expedición (opcional)</label>
            <input
              value={puntoExpedicion}
              onChange={(e) => setPuntoExpedicion(e.target.value)}
              placeholder="Para SIFEN, más adelante"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setCreando(false)}
                className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={crear}
                disabled={guardando}
                className="flex-1 rounded-xl bg-blue-700 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sucursales.map((s) => (
              <div
                key={s.id}
                className={`rounded-2xl bg-white p-5 shadow shadow-slate-200 ${!s.activa ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {s.nombre}
                      {!s.activa && <span className="ml-2 text-sm font-semibold text-red-500">INACTIVA</span>}
                    </p>
                    {s.direccion && <p className="text-sm text-slate-400">{s.direccion}</p>}
                  </div>
                  {s.activa ? (
                    <button
                      onClick={() => cambiarActiva(s.id, false)}
                      className="text-sm font-semibold text-red-500 hover:text-red-700"
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      onClick={() => cambiarActiva(s.id, true)}
                      className="text-sm font-semibold text-emerald-600 hover:text-emerald-800"
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
