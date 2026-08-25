"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import { useDebounced } from "@/lib/useDebounced";
import CampoCantidad from "@/components/CampoCantidad";

const vacio = {
  nombre: "",
  codigoBarras: "",
  unidadMedida: "unidad",
  precioCosto: "",
  precioContado: "",
  precioCredito: "",
  precioMayorista: "",
  tasaIva: 10,
  stock: "",
  esInsumo: false,
  unidadCompra: "",
  equivalenciaUnidadCompra: "",
  esCompuesto: false,
  receta: [],
};

export default function NuevoProducto() {
  const router = useRouter();
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [produccionHabilitada, setProduccionHabilitada] = useState(false);
  const [busquedaIngrediente, setBusquedaIngrediente] = useState("");
  const [resultadosIngrediente, setResultadosIngrediente] = useState([]);

  useEffect(() => {
    apiFetch("/api/empresas/actual")
      .then((e) => setProduccionHabilitada(!!e.produccion_habilitada))
      .catch(() => {});
  }, []);

  const busquedaIngredienteDebounced = useDebounced(busquedaIngrediente);
  useEffect(() => {
    if (!busquedaIngredienteDebounced) {
      setResultadosIngrediente([]);
      return;
    }
    apiFetch(`/api/productos?q=${encodeURIComponent(busquedaIngredienteDebounced)}`)
      .then((r) => setResultadosIngrediente(r.filter((p) => !p.es_compuesto)))
      .catch(() => {});
  }, [busquedaIngredienteDebounced]);

  function agregarIngrediente(p) {
    if (form.receta.some((r) => r.insumoId === p.id)) return;
    setForm({
      ...form,
      receta: [...form.receta, { insumoId: p.id, nombre: p.nombre, unidadMedida: p.unidad_medida, cantidad: "" }],
    });
    setBusquedaIngrediente("");
    setResultadosIngrediente([]);
  }

  function cambiarCantidadIngrediente(insumoId, cantidad) {
    setForm({
      ...form,
      receta: form.receta.map((r) => (r.insumoId === insumoId ? { ...r, cantidad } : r)),
    });
  }

  function quitarIngrediente(insumoId) {
    setForm({ ...form, receta: form.receta.filter((r) => r.insumoId !== insumoId) });
  }

  function actualizar(campo) {
    return (e) => {
      const valor = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setForm({ ...form, [campo]: valor });
    };
  }

  async function enviar(e) {
    e.preventDefault();
    setError("");
    if (!form.esInsumo && !(Number(form.precioContado) > 0)) {
      setError("El precio contado (precio de venta) es obligatorio y debe ser mayor a 0");
      return;
    }
    if (form.esCompuesto) {
      if (form.receta.length === 0) {
        setError("Un producto compuesto necesita al menos un ingrediente en la receta");
        return;
      }
      if (form.receta.some((r) => !(Number(r.cantidad) > 0))) {
        setError("Cargá la cantidad de cada ingrediente de la receta");
        return;
      }
    }
    setGuardando(true);
    try {
      await apiFetch("/api/productos", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          tasaIva: Number(form.tasaIva),
          precioCosto: Number(form.precioCosto) || 0,
          precioContado: Number(form.precioContado) || 0,
          precioCredito: Number(form.precioCredito) || 0,
          precioMayorista: Number(form.precioMayorista) || 0,
          stock: Number(form.stock) || 0,
          unidadCompra: form.esInsumo ? form.unidadCompra || undefined : undefined,
          equivalenciaUnidadCompra: form.esInsumo ? Number(form.equivalenciaUnidadCompra) || undefined : undefined,
          receta: form.esCompuesto
            ? form.receta.map((r) => ({ insumoId: r.insumoId, cantidad: Number(r.cantidad) || 0 }))
            : undefined,
        }),
      });
      router.push("/stock");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Nuevo producto</h1>
        </div>

        <form onSubmit={enviar} onKeyDown={avanzarConEnter} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Nombre</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Tornillo autoperforante 2 pulg" />

          <label className={etiqueta}>Código de barras</label>
          <input
            value={form.codigoBarras}
            onChange={actualizar("codigoBarras")}
            className={campo}
            placeholder="Opcional (podés escanear acá)"
          />

          <label className={etiqueta}>Unidad de medida</label>
          <input value={form.unidadMedida} onChange={actualizar("unidadMedida")} className={campo} placeholder="unidad, kilo, metro, caja..." />

          {produccionHabilitada && (
            <>
              <label className="mb-4 flex items-center gap-2">
                <input type="checkbox" checked={form.esInsumo} onChange={actualizar("esInsumo")} className="h-5 w-5" />
                <span className="text-sm font-medium text-slate-700">
                  Insumo de producción (no se vende directo, se consume en recetas)
                </span>
              </label>
              {form.esInsumo && (
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
                  <div>
                    <label className={etiqueta}>Unidad de compra</label>
                    <input
                      value={form.unidadCompra}
                      onChange={actualizar("unidadCompra")}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Ej: bolsa"
                    />
                  </div>
                  <div>
                    <label className={etiqueta}>Equivale a ({form.unidadMedida || "unidad"})</label>
                    <CampoCantidad
                      value={form.equivalenciaUnidadCompra}
                      onChange={(valor) => setForm({ ...form, equivalenciaUnidadCompra: valor })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Ej: 50"
                    />
                  </div>
                  <p className="col-span-2 text-xs text-slate-400">
                    Opcional — solo si se compra en una unidad distinta a la que se consume (ej. 1 bolsa = 50 kg).
                  </p>
                </div>
              )}
            </>
          )}

          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" checked={form.esCompuesto} onChange={actualizar("esCompuesto")} className="h-5 w-5" />
            <span className="text-sm font-medium text-slate-700">
              Producto compuesto (se arma con su receta al vender, ej. sándwich, torta casera)
            </span>
          </label>
          {form.esCompuesto && (
            <div className="mb-4 rounded-xl border border-slate-200 p-3">
              <label className={etiqueta}>Ingredientes</label>
              <input
                value={busquedaIngrediente}
                onChange={(e) => setBusquedaIngrediente(e.target.value)}
                className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Buscar producto para agregar como ingrediente..."
              />
              {resultadosIngrediente.length > 0 && (
                <div className="mb-2 flex flex-col gap-1">
                  {resultadosIngrediente.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarIngrediente(p)}
                      className="rounded-lg border border-slate-200 p-2 text-left text-sm font-semibold hover:bg-slate-50"
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              )}
              {form.receta.length > 0 && (
                <div className="flex flex-col gap-2">
                  {form.receta.map((r) => (
                    <div key={r.insumoId} className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-semibold text-slate-700">{r.nombre}</span>
                      <CampoCantidad
                        value={r.cantidad}
                        onChange={(valor) => cambiarCantidadIngrediente(r.insumoId, valor)}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
                        placeholder="0"
                      />
                      <span className="w-16 text-xs text-slate-400">{r.unidadMedida}</span>
                      <button
                        type="button"
                        onClick={() => quitarIngrediente(r.insumoId)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Cuánto de cada ingrediente lleva UNA unidad de este producto — se descuenta del stock del ingrediente
                cada vez que se vende, sin que este producto tenga stock propio.
              </p>
            </div>
          )}

          {form.esCompuesto ? (
            <p className="mb-4 text-sm text-slate-400">
              Precio de costo: se calcula solo, sumando el costo de cada ingrediente de la receta.
            </p>
          ) : (
            <>
              <label className={etiqueta}>Precio de costo (Gs, lo que pagaste)</label>
              <input type="number" min="0" value={form.precioCosto} onChange={actualizar("precioCosto")} className={campo} placeholder="0" />
            </>
          )}

          <label className={etiqueta}>Precio contado (Gs, IVA incluido){form.esInsumo && " — opcional para un insumo"}</label>
          <input
            required={!form.esInsumo}
            name="precioContado"
            type="number"
            min="0"
            value={form.precioContado}
            onChange={actualizar("precioContado")}
            className={campo}
            placeholder="0"
          />

          <label className={etiqueta}>Precio crédito (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioCredito} onChange={actualizar("precioCredito")} className={campo} placeholder="0" />

          <label className={etiqueta}>Precio mayorista (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioMayorista} onChange={actualizar("precioMayorista")} className={campo} placeholder="0" />

          <label className={etiqueta}>Tasa de IVA</label>
          <select value={form.tasaIva} onChange={actualizar("tasaIva")} className={campo}>
            <option value={10}>10%</option>
            <option value={5}>5%</option>
            <option value={0}>Exento (0%)</option>
          </select>

          {!form.esCompuesto && (
            <>
              <label className={etiqueta}>Stock inicial</label>
              <CampoCantidad value={form.stock} onChange={(valor) => setForm({ ...form, stock: valor })} className={campo} placeholder="0" />
            </>
          )}

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar producto"}
          </button>
        </form>
      </div>
    </main>
  );
}
