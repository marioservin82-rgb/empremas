"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import CampoCantidad from "@/components/CampoCantidad";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function DetalleOrdenProduccion() {
  const router = useRouter();
  const { id } = useParams();

  const [datos, setDatos] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    return apiFetch(`/api/produccion/ordenes/${id}`).then((r) => {
      setDatos(r);
      const iniciales = {};
      r.categoriasDisponibles.forEach((c) => (iniciales[c.id] = ""));
      setCantidades(iniciales);
    });
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const sumaClasificada = Object.values(cantidades).reduce((acumulado, v) => acumulado + (Number(v) || 0), 0);

  async function clasificar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await apiFetch(`/api/produccion/ordenes/${id}/clasificar`, {
        method: "POST",
        body: JSON.stringify({
          clasificaciones: Object.entries(cantidades)
            .filter(([, v]) => Number(v) > 0)
            .map(([categoriaCalidadId, cantidad]) => ({ categoriaCalidadId, cantidad: Number(cantidad) })),
        }),
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

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

  const { orden, insumosConsumidos, categoriasDisponibles, clasificacion } = datos;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/produccion/ordenes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">{orden.linea_nombre}</h1>
          <p className="text-sm text-slate-400">
            {new Date(orden.fecha).toLocaleDateString("es-PY")} · {orden.cantidad_producida} producido ·{" "}
            {orden.estado === "cerrada" ? "Clasificada" : "Sin clasificar"}
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Insumos consumidos</h2>
          <div className="flex flex-col divide-y divide-slate-100">
            {insumosConsumidos.map((i) => (
              <div key={i.insumo_id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">{i.insumo_nombre}</span>
                <span className="font-semibold text-slate-800">
                  {Number(i.cantidad_consumida).toLocaleString("es-PY")} {i.unidad_medida}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <p className="font-semibold text-slate-600">Costo total de insumos</p>
            <p className="text-xl font-extrabold text-navy">Gs {formatoGs.format(orden.costo_insumos)}</p>
          </div>
        </div>

        {orden.estado === "abierta" ? (
          <form onSubmit={clasificar} onKeyDown={avanzarConEnter} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <h2 className="mb-1 text-lg font-bold text-slate-800">Clasificar por calidad</h2>
            <p className="mb-4 text-sm text-slate-500">
              La suma tiene que coincidir con lo producido ({orden.cantidad_producida}).
            </p>

            {categoriasDisponibles.length === 0 ? (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Esta línea todavía no tiene categorías de calidad — cargalas primero desde la línea de producción.
              </p>
            ) : (
              categoriasDisponibles.map((c) => (
                <div key={c.id} className="mb-3">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {c.nombre} {c.producto_id ? `→ ${c.producto_nombre}` : "(descarte, sin valor)"}
                  </label>
                  <CampoCantidad
                    value={cantidades[c.id] ?? ""}
                    onChange={(valor) => setCantidades({ ...cantidades, [c.id]: valor })}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                    placeholder="0"
                  />
                </div>
              ))
            )}

            <p
              className={`mb-4 text-sm font-semibold ${
                sumaClasificada === Number(orden.cantidad_producida) ? "text-emerald-600" : "text-amber-600"
              }`}
            >
              Total clasificado: {sumaClasificada} / {orden.cantidad_producida}
            </p>

            <button
              type="submit"
              disabled={guardando || categoriasDisponibles.length === 0}
              className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {guardando ? "Guardando..." : "Confirmar clasificación"}
            </button>
          </form>
        ) : (
          <div className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Clasificación</h2>
            <div className="flex flex-col divide-y divide-slate-100">
              {clasificacion.map((c) => (
                <div key={c.categoria_calidad_id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{c.categoria_nombre}</span>
                  <span className="font-semibold text-slate-800">{c.cantidad}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
              <p className="font-semibold text-slate-600">Costo por unidad vendible</p>
              <p className="text-xl font-extrabold text-navy">Gs {formatoGs.format(orden.costo_unitario_calculado)}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
