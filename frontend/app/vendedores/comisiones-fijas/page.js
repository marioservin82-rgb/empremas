"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import CampoCantidad from "@/components/CampoCantidad";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function ComisionesFijasPorProducto() {
  const router = useRouter();
  const [productos, setProductos] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [monto, setMonto] = useState("");
  const [error, setError] = useState("");

  function cargar() {
    return apiFetch("/api/vendedores/productos-comision-fija").then(setProductos);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    if (!busquedaDebounced) {
      setResultados([]);
      return;
    }
    apiFetch(`/api/productos?q=${encodeURIComponent(busquedaDebounced)}`)
      .then(setResultados)
      .catch(() => {});
  }, [busquedaDebounced]);

  async function agregar(p) {
    setError("");
    if (!(Number(monto) >= 0)) {
      setError("Cargá un monto de comisión antes de elegir el producto");
      return;
    }
    try {
      await apiFetch("/api/vendedores/productos-comision-fija", {
        method: "POST",
        body: JSON.stringify({ productoId: p.id, monto: Number(monto) }),
      });
      setBusqueda("");
      setResultados([]);
      setMonto("");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function quitar(id) {
    try {
      await apiFetch(`/api/vendedores/productos-comision-fija/${id}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/vendedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Comisión fija por producto</h1>
          <p className="mt-1 text-sm text-slate-500">
            Estos productos pagan siempre este monto de comisión, sin importar qué vendedor lo venda ni su tipo de
            comisión configurado.
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-6 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className="mb-1 block text-sm font-medium text-slate-700">Monto de comisión (Gs por unidad)</label>
          <CampoCantidad value={monto} onChange={setMonto} className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20" placeholder="0" />

          <label className="mb-1 block text-sm font-medium text-slate-700">Buscar producto</label>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre o código de barras..."
            className={campo}
          />
          {resultados.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregar(p)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <span className="font-semibold">{p.nombre}</span>
                  <span className="text-slate-500">{p.unidad_medida}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {productos === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : productos.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
            Todavía no cargaste ningún producto con comisión fija.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {productos.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow shadow-slate-200">
                <div>
                  <p className="font-semibold text-slate-800">{p.producto_nombre}</p>
                  <p className="text-sm text-slate-400">Gs {formatoGs.format(p.monto)} por {p.unidad_medida}</p>
                </div>
                <button onClick={() => quitar(p.id)} className="text-red-500 hover:text-red-700">
                  ✕ Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
