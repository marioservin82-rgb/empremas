"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function Stock() {
  const router = useRouter();
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [permitirVentaSinStock, setPermitirVentaSinStock] = useState(null);
  const [sucursalActual, setSucursalActual] = useState(null);

  async function cambiarPermitirVentaSinStock(valor) {
    setPermitirVentaSinStock(valor);
    try {
      await apiFetch("/api/empresas/actual", {
        method: "PATCH",
        body: JSON.stringify({ permitirVentaSinStock: valor }),
      });
    } catch (err) {
      setPermitirVentaSinStock(!valor);
      setError(err.message);
    }
  }

  const buscar = useCallback(async (q) => {
    setCargando(true);
    setError("");
    try {
      const ruta = q ? `/api/productos?q=${encodeURIComponent(q)}` : "/api/productos";
      setProductos(await apiFetch(ruta));
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
    apiFetch("/api/empresas/actual")
      .then((e) => {
        setPermitirVentaSinStock(e.permitir_venta_sin_stock);
        if (e.limite_sucursales > 1) {
          apiFetch("/api/usuarios/yo")
            .then((yo) => setSucursalActual(yo.sucursal_nombre))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err.message));
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
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-blue-900">Stock</h1>
            {sucursalActual && (
              <p className="text-sm text-slate-400">Mostrando stock de: {sucursalActual}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href="/proveedores"
              className="rounded-xl bg-slate-700 px-5 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Compras
            </Link>
            <Link
              href="/stock/inventario"
              className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
            >
              Inventario
            </Link>
            <Link
              href="/stock/importar"
              className="rounded-xl bg-slate-700 px-5 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Importar CSV
            </Link>
            <Link
              href="/stock/nuevo"
              className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
            >
              + Agregar producto
            </Link>
          </div>
        </div>

        <form onSubmit={onSubmitBusqueda} className="mb-6 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código de barras..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800"
          >
            Buscar
          </button>
        </form>

        {permitirVentaSinStock !== null && (
          <div className="mb-6 flex items-center justify-between rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <div>
              <p className="font-semibold text-slate-800">Vender aunque no haya stock</p>
              <p className="text-sm text-slate-400">
                Si está apagado, el POS no deja vender un producto sin stock suficiente.
              </p>
            </div>
            <button
              onClick={() => cambiarPermitirVentaSinStock(!permitirVentaSinStock)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                permitirVentaSinStock ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  permitirVentaSinStock ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : productos.length === 0 ? (
          <p className="text-slate-500">No hay productos todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {productos.map((p) => (
              <div key={p.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">{p.nombre}</p>
                    <p className="text-sm text-slate-400">
                      {p.codigo_barras || "sin código"} · IVA {p.tasa_iva}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-blue-900">
                      {formatoGs.format(p.stock)}
                    </p>
                    <p className="text-sm text-slate-400">{p.unidad_medida}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-6 text-sm">
                  {p.precio_costo !== undefined && (
                    <span>
                      <span className="text-slate-400">Costo </span>
                      <span className="font-semibold text-slate-500">
                        Gs {formatoGs.format(p.precio_costo)}
                      </span>
                      {p.precio_costo > 0 && (
                        <span className="ml-1 text-xs text-emerald-600">
                          (+{Math.round(((p.precio_contado - p.precio_costo) / p.precio_costo) * 100)}%)
                        </span>
                      )}
                    </span>
                  )}
                  <span>
                    <span className="text-slate-400">Contado </span>
                    <span className="font-semibold">Gs {formatoGs.format(p.precio_contado)}</span>
                  </span>
                  <span>
                    <span className="text-slate-400">Crédito </span>
                    <span className="font-semibold">Gs {formatoGs.format(p.precio_credito)}</span>
                  </span>
                  <span>
                    <span className="text-slate-400">Mayorista </span>
                    <span className="font-semibold">Gs {formatoGs.format(p.precio_mayorista)}</span>
                  </span>
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/stock/${p.id}/editar`}
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
