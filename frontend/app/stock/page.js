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
  const [permitirVentaSinStock, setPermitirVentaSinStock] = useState(null);
  const [sucursalActual, setSucursalActual] = useState(null);
  const [valorStock, setValorStock] = useState(null);
  const [verDesactivados, setVerDesactivados] = useState(false);

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
        setPermitirVentaSinStock(e.permitir_venta_sin_stock);
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
          <div className="flex gap-2">
            <Link
              href="/proveedores"
              className="rounded-xl bg-slate-700 px-5 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Compras
            </Link>
            <Link
              href="/stock/inventario"
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
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
              href="/stock/sugerencias-asociaciones"
              className="rounded-xl bg-slate-700 px-5 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Venta cruzada
            </Link>
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
              <div
                key={p.id}
                className={`rounded-2xl bg-white p-5 shadow shadow-slate-200 ${!p.activo ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
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
                <div className="mt-3 flex justify-end">
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
