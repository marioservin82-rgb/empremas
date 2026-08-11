"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function Proveedores() {
  const router = useRouter();
  const [proveedores, setProveedores] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const buscar = useCallback(async (q) => {
    setCargando(true);
    setError("");
    try {
      const ruta = q ? `/api/proveedores?q=${encodeURIComponent(q)}` : "/api/proveedores";
      setProveedores(await apiFetch(ruta));
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
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    buscar(busquedaDebounced);
  }, [busquedaDebounced, buscar]);

  function onSubmitBusqueda(e) {
    e.preventDefault();
    buscar(busqueda);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver a Stock
            </Link>
            <h1 className="text-2xl font-bold text-blue-900">Proveedores</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/compras/nueva"
              className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
            >
              + Registrar compra
            </Link>
            <Link
              href="/proveedores/nuevo"
              className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
            >
              + Agregar proveedor
            </Link>
          </div>
        </div>

        <form onSubmit={onSubmitBusqueda} className="mb-6 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o RUC..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <button type="submit" className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">
            Buscar
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : proveedores.length === 0 ? (
          <p className="text-slate-500">No hay proveedores todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {proveedores.map((p) => (
              <div key={p.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">{p.nombre}</p>
                    <p className="text-sm text-slate-400">
                      {p.documento || "sin documento"} {p.telefono ? `· ${p.telefono}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-extrabold ${Number(p.saldo) > 0 ? "text-amber-600" : "text-slate-400"}`}>
                      Gs {formatoGs.format(p.saldo)}
                    </p>
                    <p className="text-sm text-slate-400">le debemos</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-4">
                  {Number(p.saldo) > 0 && (
                    <Link
                      href={`/proveedores/${p.id}/pago`}
                      className="text-sm font-semibold text-amber-600 hover:text-amber-800"
                    >
                      Pagar
                    </Link>
                  )}
                  <Link
                    href={`/proveedores/${p.id}/extracto`}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Extracto
                  </Link>
                  <Link
                    href={`/proveedores/${p.id}/editar`}
                    className="text-sm font-semibold text-blue-700 hover:text-blue-900"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
