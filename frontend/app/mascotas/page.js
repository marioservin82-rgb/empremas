"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

export default function Mascotas() {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [mascotas, setMascotas] = useState(null);
  const [error, setError] = useState("");

  async function cargar(q) {
    setError("");
    try {
      setMascotas(await apiFetch(`/api/mascotas${q ? `?q=${encodeURIComponent(q)}` : ""}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    cargar(busquedaDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Mascotas</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/mascotas/vacunas-por-vencer"
              className="rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white hover:bg-slate-800"
            >
              💉 Vacunas
            </Link>
            <Link
              href="/mascotas/nueva"
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              + Nueva mascota
            </Link>
          </div>
        </div>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre de la mascota o del dueño..."
          className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        />

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {mascotas === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : mascotas.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-slate-500 shadow shadow-slate-200">
            No hay mascotas registradas todavía.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {mascotas.map((m) => (
              <Link
                key={m.id}
                href={`/mascotas/${m.id}`}
                className="block rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <p className="text-lg font-bold text-slate-800">
                  {m.nombre} <span className="text-sm font-normal text-slate-400">· {m.especie}{m.raza ? ` · ${m.raza}` : ""}</span>
                </p>
                <p className="text-sm text-slate-400">Dueño: {m.cliente_nombre} · {m.cliente_celular || "sin celular"}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
