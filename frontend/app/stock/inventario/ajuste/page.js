"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import CampoCantidad from "@/components/CampoCantidad";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function AjusteInventario() {
  const router = useRouter();

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [producto, setProducto] = useState(null);
  const [cantidadNueva, setCantidadNueva] = useState("");
  const [motivo, setMotivo] = useState("");

  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
    }
  }, [router]);

  async function buscar(e) {
    e.preventDefault();
    if (!busqueda) return;
    try {
      setResultados(await apiFetch(`/api/productos?excluirCompuestos=true&q=${encodeURIComponent(busqueda)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function seleccionar(p) {
    setProducto(p);
    setResultados([]);
    setBusqueda("");
    setCantidadNueva(String(p.stock));
    setMotivo("");
    setExito("");
  }

  const diferencia = producto ? Number(cantidadNueva || 0) - Number(producto.stock) : 0;
  const puedeConfirmar = producto && cantidadNueva !== "" && motivo.trim().length > 0;

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const ajuste = await apiFetch(`/api/productos/${producto.id}/ajustes`, {
        method: "POST",
        body: JSON.stringify({ cantidadNueva: Number(cantidadNueva), motivo: motivo.trim() }),
      });
      setExito(
        `Ajustado: ${ajuste.productoNombre} pasó de ${formatoGs.format(ajuste.cantidadAnterior)} a ${formatoGs.format(ajuste.cantidadNueva)} (${ajuste.diferencia >= 0 ? "+" : ""}${formatoGs.format(ajuste.diferencia)})`
      );
      setProducto(null);
      setCantidadNueva("");
      setMotivo("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link href="/stock/inventario" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Ajuste de inventario</h1>
        </div>

        {exito && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>
        )}

        {!producto ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Buscá el producto</p>
            <form onSubmit={buscar} className="flex gap-2">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o código de barras..."
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
              <button type="submit" className="rounded-xl bg-amber-600 px-6 py-3 font-semibold text-white hover:bg-amber-700">
                Buscar
              </button>
            </form>
            {resultados.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => seleccionar(p)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="text-slate-500">stock actual {formatoGs.format(p.stock)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-1 font-bold text-slate-800">{producto.nombre}</p>
            <p className="mb-4 text-sm text-slate-400">Stock actual: {formatoGs.format(producto.stock)} {producto.unidad_medida}</p>

            <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad real (contada)</label>
            <CampoCantidad
              value={cantidadNueva}
              onChange={(valor) => setCantidadNueva(valor)}
              className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
            />
            {cantidadNueva !== "" && diferencia !== 0 && (
              <p className={`mb-4 text-sm font-semibold ${diferencia > 0 ? "text-emerald-600" : "text-red-600"}`}>
                Diferencia: {diferencia > 0 ? "+" : ""}
                {formatoGs.format(diferencia)}
              </p>
            )}

            <label className="mb-1 block text-sm font-medium text-slate-700">Motivo</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: conteo físico, rotura, vencido..."
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
            />

            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setProducto(null)}
                className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cambiar
              </button>
              <button
                onClick={confirmar}
                disabled={enviando || !puedeConfirmar}
                className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
              >
                {enviando ? "Guardando..." : "Confirmar ajuste"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
