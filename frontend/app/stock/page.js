"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

const TAMANO_PAGINA = 50;

export default function Stock() {
  const router = useRouter();
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState("");
  const [sucursalActual, setSucursalActual] = useState(null);
  const [valorStock, setValorStock] = useState(null);
  const [verDesactivados, setVerDesactivados] = useState(false);
  const [seleccionados, setSeleccionados] = useState([]);

  function alternarSeleccion(id) {
    setSeleccionados((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));
  }

  // Sin busqueda, se trae de a paginas (TAMANO_PAGINA a la vez) - con un
  // catalogo grande, traer y renderizar todo de una sola vez tildaba el
  // navegador, sobre todo justo al volver acá después de cargar un
  // producto nuevo. Buscando por nombre/código sí sigue trayendo todo lo
  // que matchea de una, porque ahí la lista ya viene acotada sola.
  const buscar = useCallback(async (q, inactivos) => {
    setCargando(true);
    setError("");
    try {
      const paramInactivos = inactivos ? "&incluirInactivos=true" : "";
      const ruta = q
        ? `/api/productos?q=${encodeURIComponent(q)}${paramInactivos}`
        : `/api/productos?limit=${TAMANO_PAGINA}&offset=0${paramInactivos}`;
      const resultado = await apiFetch(ruta);
      setProductos(resultado);
      setHayMas(!q && resultado.length === TAMANO_PAGINA);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  async function cargarMas() {
    setCargandoMas(true);
    try {
      const paramInactivos = verDesactivados ? "&incluirInactivos=true" : "";
      const resultado = await apiFetch(
        `/api/productos?limit=${TAMANO_PAGINA}&offset=${productos.length}${paramInactivos}`
      );
      setProductos((actual) => [...actual, ...resultado]);
      setHayMas(resultado.length === TAMANO_PAGINA);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoMas(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/actual")
      .then((e) => {
        if (e.limite_sucursales > 1) {
          apiFetch("/api/usuarios/yo")
            .then((yo) => setSucursalActual(yo.sucursal_nombre))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err.message));
    // Silencioso a proposito: este endpoint es dueno/encargado con
    // ver_reportes - un cajero visitando /stock simplemente no ve la
    // tarjeta, sin que aparezca un error de permiso en pantalla.
    apiFetch("/api/productos/inventario-valorizado")
      .then((r) => setValorStock(r.totalCosto))
      .catch(() => {});
  }, [router]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    buscar(busquedaDebounced, verDesactivados);
  }, [busquedaDebounced, verDesactivados, buscar]);

  function onSubmitBusqueda(e) {
    e.preventDefault();
    buscar(busqueda, verDesactivados);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Stock</h1>
            {sucursalActual && (
              <p className="text-sm text-slate-400">Mostrando stock de: {sucursalActual}</p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/stock/inventario"
              className="rounded-xl bg-slate-700 px-5 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Inventario
            </Link>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-200 [&::-webkit-details-marker]:hidden">
                Más ▾
              </summary>
              <div className="absolute right-0 z-20 mt-2 flex w-56 flex-col gap-1 rounded-xl bg-white p-2 shadow-lg shadow-slate-200">
                <Link href="/compras" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Compras
                </Link>
                <Link href="/proveedores" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Proveedores
                </Link>
                <Link href="/stock/importar" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Importar CSV
                </Link>
                <Link href="/stock/sugerencias-asociaciones" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Venta cruzada
                </Link>
              </div>
            </details>
            <Link
              href="/stock/nuevo"
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              + Agregar producto
            </Link>
          </div>
        </div>

        {valorStock !== null && (
          <Link
            href="/stock/inventario/valorizado"
            className="mb-6 flex items-center justify-between rounded-2xl bg-navy p-5 text-white shadow-lg shadow-slate-200 transition hover:bg-navy-2"
          >
            <div>
              <p className="text-sm text-white/70">Valor de stock (a costo)</p>
              <p className="text-2xl font-extrabold">Gs {formatoGs.format(valorStock)}</p>
            </div>
            <span className="text-sm font-semibold text-white/80">Ver detalle →</span>
          </Link>
        )}

        <form onSubmit={onSubmitBusqueda} className="mb-6 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código de barras..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
          <button
            type="submit"
            className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light"
          >
            Buscar
          </button>
        </form>

        <label className="mb-6 -mt-3 flex items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={verDesactivados}
            onChange={(e) => setVerDesactivados(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Ver también los desactivados
        </label>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {seleccionados.length > 0 && (
          <div className="sticky top-0 z-30 mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-md backdrop-blur">
            <p className="text-sm font-semibold text-slate-600">
              {seleccionados.length} producto{seleccionados.length === 1 ? "" : "s"} seleccionado
              {seleccionados.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSeleccionados([])}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <Link
                href={`/stock/etiquetas?ids=${seleccionados.join(",")}`}
                className="rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-light"
              >
                🏷️ Imprimir etiquetas →
              </Link>
            </div>
          </div>
        )}

        {!cargando && productos.length > 0 && seleccionados.length === 0 && (
          <p className="mb-3 text-xs text-slate-400">
            Marcá el ☑ de un producto para seleccionarlo e imprimir su etiqueta.
          </p>
        )}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : productos.length === 0 ? (
          <p className="text-slate-500">No hay productos todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {productos.map((p) => (
              <div
                key={p.id}
                className={`rounded-2xl bg-white p-5 shadow shadow-slate-200 ${!p.activo ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(p.id)}
                      onChange={() => alternarSeleccion(p.id)}
                      className="mt-1.5 h-4 w-4 shrink-0 rounded border-slate-300"
                      title="Seleccionar para imprimir etiquetas"
                    />
                    <div>
                    <p className="flex items-center gap-2 text-lg font-bold text-slate-800">
                      {p.nombre}
                      {!p.activo && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          Desactivado
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-400">
                      {p.codigo_barras || "sin código"} · IVA {p.tasa_iva}%
                    </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-navy">
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
                <div className="mt-3 flex justify-end gap-4">
                  <Link
                    href={`/stock/etiquetas?ids=${p.id}`}
                    className="text-sm font-semibold text-navy hover:text-brand"
                  >
                    🏷️ Etiqueta
                  </Link>
                  <Link
                    href={`/stock/${p.id}/editar`}
                    className="text-sm font-semibold text-navy hover:text-brand"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {!cargando && hayMas && (
          <button
            onClick={cargarMas}
            disabled={cargandoMas}
            className="mt-4 w-full rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
          >
            {cargandoMas ? "Cargando..." : "Cargar más productos"}
          </button>
        )}
      </div>
    </main>
  );
}
