"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const ESTILO_ESTADO = {
  libre: "bg-slate-100 text-slate-500 border-slate-200",
  ocupada: "bg-navy text-white border-navy",
  cuenta_pedida: "bg-brand text-white border-brand",
};

const ETIQUETA_ESTADO = {
  libre: "Libre",
  ocupada: "Ocupada",
  cuenta_pedida: "Cuenta pedida",
};

export default function Mesas() {
  const router = useRouter();
  const [mesas, setMesas] = useState(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [esVirtualNueva, setEsVirtualNueva] = useState(false);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [yo, setYo] = useState(null);
  const [error, setError] = useState("");

  function cargar() {
    apiFetch("/api/mesas")
      .then(setMesas)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo").then(setYo).catch(() => {});
    cargar();
  }, [router]);

  async function crearMesa(e) {
    e.preventDefault();
    if (!nombreNueva.trim()) return;
    try {
      await apiFetch("/api/mesas", {
        method: "POST",
        body: JSON.stringify({ nombre: nombreNueva.trim(), esVirtual: esVirtualNueva }),
      });
      setNombreNueva("");
      setEsVirtualNueva(false);
      setMostrarAlta(false);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!mesas) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  const fisicas = mesas.filter((m) => !m.es_virtual);
  const virtuales = mesas.filter((m) => m.es_virtual);
  const puedeGestionar = yo?.rol === "dueno" || yo?.rol === "encargado";

  function Boton({ mesa }) {
    const estilo = ESTILO_ESTADO[mesa.estado] || ESTILO_ESTADO.libre;
    return (
      <Link
        href={`/mesas/${mesa.id}`}
        className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 p-4 shadow-sm transition active:scale-[0.98] ${estilo}`}
      >
        <span className="text-lg font-bold">{mesa.nombre}</span>
        <span className="text-xs font-medium opacity-90">{ETIQUETA_ESTADO[mesa.estado] || mesa.estado}</span>
        {mesa.cliente_nombre && <span className="text-xs opacity-80">{mesa.cliente_nombre}</span>}
      </Link>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-navy">Mesas</h1>
          </div>
          {puedeGestionar && (
            <button
              onClick={() => setMostrarAlta((v) => !v)}
              className="rounded-xl bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-light"
            >
              + Mesa
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {mostrarAlta && (
          <form onSubmit={crearMesa} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
              <input
                required
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                placeholder="Ej: Mesa 5, Para llevar, Delivery"
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <label className="mb-1 flex items-center gap-2 pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={esVirtualNueva} onChange={(e) => setEsVirtualNueva(e.target.checked)} />
              Es virtual (para llevar/delivery, sin ocupación física)
            </label>
            <button type="submit" className="rounded-xl bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-2">
              Crear
            </button>
          </form>
        )}

        <p className="mb-2 text-sm font-semibold text-slate-500">Mesas físicas</p>
        {fisicas.length === 0 ? (
          <p className="mb-6 text-sm text-slate-400">Todavía no hay mesas cargadas.</p>
        ) : (
          <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {fisicas.map((m) => (
              <Boton key={m.id} mesa={m} />
            ))}
          </div>
        )}

        {virtuales.length > 0 && (
          <>
            <p className="mb-2 text-sm font-semibold text-slate-500">Para llevar / Delivery</p>
            <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {virtuales.map((m) => (
                <Boton key={m.id} mesa={m} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
