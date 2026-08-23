"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

export default function EditarProducto() {
  const router = useRouter();
  const { id } = useParams();

  const [form, setForm] = useState(null);
  const [costoPromedio, setCostoPromedio] = useState(0);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [asociados, setAsociados] = useState([]);
  const [busquedaAsociado, setBusquedaAsociado] = useState("");
  const [resultadosAsociado, setResultadosAsociado] = useState([]);
  const [produccionHabilitada, setProduccionHabilitada] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch(`/api/productos/${id}`)
      .then((p) => {
        setCostoPromedio(Number(p.precio_costo));
        setForm({
          nombre: p.nombre,
          codigoBarras: p.codigo_barras || "",
          unidadMedida: p.unidad_medida,
          precioContado: p.precio_contado,
          precioCredito: p.precio_credito,
          precioMayorista: p.precio_mayorista,
          tasaIva: p.tasa_iva,
          stock: p.stock,
          stockMinimo: p.stock_minimo ?? "",
          esInsumo: p.es_insumo,
          unidadCompra: p.unidad_compra || "",
          equivalenciaUnidadCompra: p.equivalencia_unidad_compra ?? "",
        });
      })
      .catch((err) => setError(err.message));
    apiFetch(`/api/productos/${id}/asociados`)
      .then(setAsociados)
      .catch(() => {});
    apiFetch("/api/empresas/actual")
      .then((e) => setProduccionHabilitada(!!e.produccion_habilitada))
      .catch(() => {});
  }, [id, router]);

  const busquedaAsociadoDebounced = useDebounced(busquedaAsociado);
  useEffect(() => {
    if (!busquedaAsociadoDebounced) {
      setResultadosAsociado([]);
      return;
    }
    apiFetch(`/api/productos?q=${encodeURIComponent(busquedaAsociadoDebounced)}`)
      .then((resultados) =>
        setResultadosAsociado(
          resultados.filter((p) => p.id !== id && !asociados.some((a) => a.id === p.id))
        )
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaAsociadoDebounced, id, asociados]);

  async function agregarAsociado(p) {
    try {
      await apiFetch(`/api/productos/${id}/asociados`, {
        method: "POST",
        body: JSON.stringify({ productoAsociadoId: p.id }),
      });
      setAsociados((actual) => [...actual, { ...p, origen: "manual" }]);
      setResultadosAsociado([]);
      setBusquedaAsociado("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function quitarAsociado(asociadoId) {
    try {
      await apiFetch(`/api/productos/${id}/asociados/${asociadoId}`, { method: "DELETE" });
      setAsociados((actual) => actual.filter((a) => a.id !== asociadoId));
    } catch (err) {
      setError(err.message);
    }
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
    setGuardando(true);
    try {
      await apiFetch(`/api/productos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          tasaIva: Number(form.tasaIva),
          precioContado: Number(form.precioContado),
          precioCredito: Number(form.precioCredito),
          precioMayorista: Number(form.precioMayorista),
          stockMinimo: form.stockMinimo === "" ? undefined : Number(form.stockMinimo),
          unidadCompra: form.esInsumo ? form.unidadCompra || undefined : undefined,
          equivalenciaUnidadCompra: form.esInsumo ? Number(form.equivalenciaUnidadCompra) || undefined : undefined,
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
  const formatoGs = new Intl.NumberFormat("es-PY");

  // Precios que quedaron por debajo del costo promedio - un problema
  // comun y silencioso cuando el costo sube por una compra reciente y el
  // precio de venta no se llega a actualizar a tiempo.
  const preciosBajoCosto = form
    ? [
        ["Contado", Number(form.precioContado)],
        ["Crédito", Number(form.precioCredito)],
        ["Mayorista", Number(form.precioMayorista)],
      ].filter(([, precio]) => precio > 0 && precio < costoPromedio)
    : [];

  if (error && !form) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Editar producto</h1>
        </div>

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Nombre</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} />

          <label className={etiqueta}>Código de barras</label>
          <input value={form.codigoBarras} onChange={actualizar("codigoBarras")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Unidad de medida</label>
          <input value={form.unidadMedida} onChange={actualizar("unidadMedida")} className={campo} />

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
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.equivalenciaUnidadCompra}
                      onChange={actualizar("equivalenciaUnidadCompra")}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Ej: 50"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <label className={etiqueta}>Costo promedio actual</label>
          <div className="mb-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg">
            <span className="font-semibold text-slate-700">Gs {formatoGs.format(costoPromedio)}</span>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Se actualiza solo con cada compra (promedio ponderado por cantidad) — no se edita a mano.
          </p>

          {preciosBajoCosto.length > 0 && (
            <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-semibold">Estás vendiendo por debajo de tu costo promedio (Gs {formatoGs.format(costoPromedio)}):</p>
              <ul className="mt-1 list-disc pl-5">
                {preciosBajoCosto.map(([etiquetaPrecio, precio]) => (
                  <li key={etiquetaPrecio}>
                    Precio {etiquetaPrecio}: Gs {formatoGs.format(precio)}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Revisá el precio.</p>
            </div>
          )}

          <label className={etiqueta}>Precio contado (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioContado} onChange={actualizar("precioContado")} className={campo} />

          <label className={etiqueta}>Precio crédito (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioCredito} onChange={actualizar("precioCredito")} className={campo} />

          <label className={etiqueta}>Precio mayorista (Gs, IVA incluido)</label>
          <input type="number" min="0" value={form.precioMayorista} onChange={actualizar("precioMayorista")} className={campo} />

          <label className={etiqueta}>Tasa de IVA</label>
          <select value={form.tasaIva} onChange={actualizar("tasaIva")} className={campo}>
            <option value={10}>10%</option>
            <option value={5}>5%</option>
            <option value={0}>Exento (0%)</option>
          </select>

          <label className={etiqueta}>Stock actual</label>
          <div className="mb-1 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg">
            <span className="font-semibold text-slate-700">{form.stock}</span>
            <Link href="/stock/inventario/ajuste" className="text-sm font-semibold text-navy hover:text-brand">
              Ajustar
            </Link>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            El stock se corrige desde Ajuste de inventario, para dejar registrado el motivo.
          </p>

          <label className={etiqueta}>Stock mínimo (alerta de reposición)</label>
          <input type="number" min="0" step="0.001" value={form.stockMinimo} onChange={actualizar("stockMinimo")} className={campo} placeholder="Opcional" />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>

        <div className="mt-4 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <h2 className="mb-1 text-lg font-bold text-navy">Productos asociados</h2>
          <p className="mb-4 text-xs text-slate-400">
            Cuando el cajero agregue "{form.nombre}" al carrito en Vender, se le va a sugerir agregar estos también.
            La asociación es en este sentido — no hace falta que sea recíproca.
          </p>

          {asociados.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {asociados.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <span className="font-semibold text-slate-800">
                    {a.nombre}
                    {a.origen === "automatica" && (
                      <span className="ml-2 text-xs font-normal text-slate-400">(sugerida automáticamente)</span>
                    )}
                  </span>
                  <button onClick={() => quitarAsociado(a.id)} className="text-red-500 hover:text-red-700">
                    ✕ Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            value={busquedaAsociado}
            onChange={(e) => setBusquedaAsociado(e.target.value)}
            placeholder="Buscar producto para asociar..."
            className={campo}
          />
          {resultadosAsociado.length > 0 && (
            <div className="-mt-2 flex flex-col gap-2">
              {resultadosAsociado.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregarAsociado(p)}
                  className="rounded-xl border border-slate-200 p-3 text-left font-semibold hover:bg-slate-50"
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
