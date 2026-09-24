"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function Presupuestos() {
  const router = useRouter();
  const [presupuestos, setPresupuestos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const buscar = useCallback(async (q) => {
    setCargando(true);
    setError("");
    try {
      const ruta = q ? `/api/presupuestos?q=${encodeURIComponent(q)}` : "/api/presupuestos";
      setPresupuestos(await apiFetch(ruta));
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
    buscar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    buscar(busquedaDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced]);

  function onSubmitBusqueda(e) {
    e.preventDefault();
    buscar(busqueda);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/vender" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver a Vender
            </Link>
            <h1 className="text-2xl font-bold text-navy">Presupuestos</h1>
          </div>
          <Link
            href="/presupuestos/nuevo"
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nuevo presupuesto
          </Link>
        </div>

        <form onSubmit={onSubmitBusqueda} className="mb-6 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, cédula/RUC o número..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light"
          >
            Buscar
          </button>
        </form>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : presupuestos.length === 0 ? (
          <p className="text-slate-500">
            {busqueda ? "Ningún presupuesto coincide con la búsqueda." : "No hay presupuestos todavía."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {presupuestos.map((p) => (
              <Link
                key={p.id}
                href={`/presupuestos/${p.id}`}
                className="rounded-2xl bg-white p-5 shadow shadow-slate-200 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {p.numero != null && <span className="text-slate-400">N° {p.numero} · </span>}
                      {p.cliente_nombre || "Sin cliente"}
                    </p>
                    <p className="text-sm text-slate-400">
                      Vence {new Date(p.vencimiento).toLocaleDateString("es-PY")}
                      {p.vencido && <span className="ml-2 font-semibold text-red-500">VENCIDO</span>}
                    </p>
                  </div>
                  <p className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(p.total)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
