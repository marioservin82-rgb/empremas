"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

export default function DetalleLineaProduccion() {
  const router = useRouter();
  const { id } = useParams();

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  const [busquedaInsumo, setBusquedaInsumo] = useState("");
  const [resultadosInsumo, setResultadosInsumo] = useState([]);
  const [cantidadInsumo, setCantidadInsumo] = useState("");
  const [insumoElegido, setInsumoElegido] = useState(null);

  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [categoriaConValor, setCategoriaConValor] = useState(true);
  const [productoCategoria, setProductoCategoria] = useState(null);
  const [busquedaProductoCategoria, setBusquedaProductoCategoria] = useState("");
  const [resultadosProductoCategoria, setResultadosProductoCategoria] = useState([]);
  const [creandoProductoCategoria, setCreandoProductoCategoria] = useState(false);
  const [nombreProductoNuevo, setNombreProductoNuevo] = useState("");
  const [precioProductoNuevo, setPrecioProductoNuevo] = useState("");

  function cargar() {
    return apiFetch(`/api/produccion/lineas/${id}`).then(setDatos);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const busquedaInsumoDebounced = useDebounced(busquedaInsumo);
  useEffect(() => {
    if (!busquedaInsumoDebounced) {
      setResultadosInsumo([]);
      return;
    }
    apiFetch(`/api/productos?q=${encodeURIComponent(busquedaInsumoDebounced)}`)
      .then((r) => setResultadosInsumo(r.filter((p) => p.es_insumo)))
      .catch(() => {});
  }, [busquedaInsumoDebounced]);

  const busquedaProductoCategoriaDebounced = useDebounced(busquedaProductoCategoria);
  useEffect(() => {
    if (!busquedaProductoCategoriaDebounced) {
      setResultadosProductoCategoria([]);
      return;
    }
    apiFetch(`/api/productos?q=${encodeURIComponent(busquedaProductoCategoriaDebounced)}`)
      .then((r) => setResultadosProductoCategoria(r.filter((p) => !p.es_insumo)))
      .catch(() => {});
  }, [busquedaProductoCategoriaDebounced]);

  async function agregarReceta(e) {
    e.preventDefault();
    setError("");
    if (!insumoElegido || !(Number(cantidadInsumo) > 0)) {
      setError("Elegí un insumo y una cantidad mayor a 0");
      return;
    }
    try {
      await apiFetch(`/api/produccion/lineas/${id}/receta`, {
        method: "POST",
        body: JSON.stringify({ insumoId: insumoElegido.id, cantidad: Number(cantidadInsumo) }),
      });
      setInsumoElegido(null);
      setBusquedaInsumo("");
      setCantidadInsumo("");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function quitarReceta(itemId) {
    try {
      await apiFetch(`/api/produccion/receta/${itemId}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function crearProductoParaCategoria(e) {
    e.preventDefault();
    setError("");
    try {
      const nuevo = await apiFetch("/api/productos", {
        method: "POST",
        body: JSON.stringify({ nombre: nombreProductoNuevo, precioContado: Number(precioProductoNuevo) || 0 }),
      });
      setProductoCategoria(nuevo);
      setCreandoProductoCategoria(false);
      setNombreProductoNuevo("");
      setPrecioProductoNuevo("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function agregarCategoria(e) {
    e.preventDefault();
    setError("");
    if (!nuevaCategoria.trim()) {
      setError("Ponele un nombre a la categoría de calidad");
      return;
    }
    if (categoriaConValor && !productoCategoria) {
      setError("Elegí o creá el producto vendible para esta categoría");
      return;
    }
    try {
      await apiFetch(`/api/produccion/lineas/${id}/categorias`, {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevaCategoria.trim(),
          productoId: categoriaConValor ? productoCategoria.id : null,
        }),
      });
      setNuevaCategoria("");
      setCategoriaConValor(true);
      setProductoCategoria(null);
      setBusquedaProductoCategoria("");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  if (error && !datos) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }
  if (!datos) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  const { linea, receta, categorias } = datos;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/produccion/lineas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">{linea.nombre}</h1>
          <p className="text-sm text-slate-400">
            Receta de referencia: {linea.cantidad_referencia} {linea.unidad_referencia}
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Receta</h2>
          {receta.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {receta.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <span className="font-semibold text-slate-800">
                    {r.cantidad} {r.unidad_medida} de {r.insumo_nombre}
                  </span>
                  <button onClick={() => quitarReceta(r.id)} className="text-red-500 hover:text-red-700">
                    ✕ Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={agregarReceta}>
            <input
              value={busquedaInsumo}
              onChange={(e) => {
                setBusquedaInsumo(e.target.value);
                setInsumoElegido(null);
              }}
              placeholder="Buscar insumo..."
              className={campo}
            />
            {resultadosInsumo.length > 0 && !insumoElegido && (
              <div className="-mt-2 mb-3 flex flex-col gap-2">
                {resultadosInsumo.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setInsumoElegido(p);
                      setBusquedaInsumo(p.nombre);
                      setResultadosInsumo([]);
                    }}
                    className="rounded-xl border border-slate-200 p-3 text-left font-semibold hover:bg-slate-50"
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
            {insumoElegido && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className={etiqueta}>
                    Cantidad ({insumoElegido.unidad_medida}) para {linea.cantidad_referencia} {linea.unidad_referencia}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={cantidadInsumo}
                    onChange={(e) => setCantidadInsumo(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                </div>
                <button type="submit" className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light">
                  Agregar
                </button>
              </div>
            )}
          </form>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Categorías de calidad</h2>
          {categorias.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {categorias.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold text-slate-800">{c.nombre}</p>
                  <p className="text-sm text-slate-400">
                    {c.producto_id ? `Producto vendible: ${c.producto_nombre}` : "Descarte — sin valor, no entra a stock"}
                  </p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={agregarCategoria}>
            <label className={etiqueta}>Nombre de la categoría</label>
            <input
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              className={campo}
              placeholder="Ej: Primera, Segunda, Descarte..."
            />

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCategoriaConValor(true)}
                className={`rounded-xl py-2 text-sm font-semibold transition ${
                  categoriaConValor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Con valor (se vende)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategoriaConValor(false);
                  setProductoCategoria(null);
                }}
                className={`rounded-xl py-2 text-sm font-semibold transition ${
                  !categoriaConValor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Descarte (sin valor)
              </button>
            </div>

            {categoriaConValor && (
              <div className="mb-3 rounded-xl border border-slate-200 p-3">
                {productoCategoria ? (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{productoCategoria.nombre}</span>
                    <button
                      type="button"
                      onClick={() => setProductoCategoria(null)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : creandoProductoCategoria ? (
                  <div>
                    <label className={etiqueta}>Nombre del producto</label>
                    <input
                      value={nombreProductoNuevo}
                      onChange={(e) => setNombreProductoNuevo(e.target.value)}
                      className={campo}
                      placeholder="Ej: Ladrillo Primera"
                    />
                    <label className={etiqueta}>Precio contado (Gs)</label>
                    <input
                      type="number"
                      min="0"
                      value={precioProductoNuevo}
                      onChange={(e) => setPrecioProductoNuevo(e.target.value)}
                      className={campo}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={crearProductoParaCategoria}
                        className="flex-1 rounded-xl bg-brand py-2 font-semibold text-white hover:bg-brand-light"
                      >
                        Crear producto
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreandoProductoCategoria(false)}
                        className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      value={busquedaProductoCategoria}
                      onChange={(e) => setBusquedaProductoCategoria(e.target.value)}
                      placeholder="Buscar producto vendible ya existente..."
                      className={campo}
                    />
                    {resultadosProductoCategoria.length > 0 && (
                      <div className="-mt-2 mb-3 flex flex-col gap-2">
                        {resultadosProductoCategoria.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setProductoCategoria(p);
                              setResultadosProductoCategoria([]);
                              setBusquedaProductoCategoria("");
                            }}
                            className="rounded-xl border border-slate-200 p-2 text-left text-sm font-semibold hover:bg-slate-50"
                          >
                            {p.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setCreandoProductoCategoria(true)}
                      className="text-sm font-semibold text-navy hover:text-brand"
                    >
                      + Crear producto nuevo
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light"
            >
              Agregar categoría
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
