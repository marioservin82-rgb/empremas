"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import CampoCantidad from "@/components/CampoCantidad";

const formatoGs = new Intl.NumberFormat("es-PY");

const vacio = { nombre: "", telefono: "", tipoComision: "porcentaje", valorComision: "" };

const ETIQUETA_POLITICA = {
  mantener: "quedan asignados a él",
  desasignar: "quedan sin vendedor asignado",
};

export default function ListaVendedores() {
  const router = useRouter();
  const [vendedores, setVendedores] = useState(null);
  const [politicaDefault, setPoliticaDefault] = useState("mantener");
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [desactivando, setDesactivando] = useState(null); // id del vendedor con el panel abierto
  const [reasignarA, setReasignarA] = useState("");

  function cargar() {
    return apiFetch("/api/vendedores").then(setVendedores);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((err) => setError(err.message));
    apiFetch("/api/empresas/actual")
      .then((e) => setPoliticaDefault(e.politica_clientes_vendedor_inactivo || "mantener"))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function crear(e) {
    e.preventDefault();
    setError("");
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/api/vendedores", {
        method: "POST",
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          telefono: form.telefono || undefined,
          tipoComision: form.tipoComision,
          valorComision: Number(form.valorComision) || 0,
        }),
      });
      setForm(vacio);
      setCreando(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function activar(id) {
    setError("");
    try {
      await apiFetch(`/api/vendedores/${id}`, { method: "PATCH", body: JSON.stringify({ activo: true }) });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmarDesactivar(id, reasignarClientesA) {
    setError("");
    try {
      await apiFetch(`/api/vendedores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: false, reasignarClientesA }),
      });
      setDesactivando(null);
      setReasignarA("");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  const vendedoresActivos = (vendedores || []).filter((v) => v.activo);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/vendedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Vendedores</h1>
          </div>
          <button
            onClick={() => setCreando(true)}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nuevo vendedor
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {creando && (
          <form onSubmit={crear} className="mb-6 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-navy">Nuevo vendedor</h2>
            <label className={etiqueta}>Nombre</label>
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className={campo}
              placeholder="Nombre y apellido"
            />
            <label className={etiqueta}>Teléfono (opcional)</label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              className={campo}
              placeholder="0981234567"
            />

            <p className={etiqueta}>Tipo de comisión</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, tipoComision: "porcentaje" })}
                className={`rounded-xl py-2 text-sm font-semibold transition ${
                  form.tipoComision === "porcentaje" ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Porcentaje
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, tipoComision: "monto_fijo_unidad" })}
                className={`rounded-xl py-2 text-sm font-semibold transition ${
                  form.tipoComision === "monto_fijo_unidad" ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Monto fijo por unidad
              </button>
            </div>

            <label className={etiqueta}>
              {form.tipoComision === "porcentaje" ? "Porcentaje (%)" : "Monto por unidad vendida (Gs)"}
            </label>
            <CampoCantidad
              value={form.valorComision}
              onChange={(valor) => setForm({ ...form, valorComision: valor })}
              className={campo}
              placeholder="0"
            />
            <p className="-mt-3 mb-4 text-xs text-slate-400">
              No aplica a los productos con comisión fija (esos siempre pagan lo que esté configurado ahí, sin
              importar el vendedor).
            </p>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
              >
                {guardando ? "Creando..." : "Crear vendedor"}
              </button>
              <button
                type="button"
                onClick={() => setCreando(false)}
                className="rounded-xl bg-slate-100 px-6 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {vendedores === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : vendedores.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
            Todavía no hay vendedores cargados.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {vendedores.map((v) => (
              <div key={v.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/vendedores/${v.id}`} className="flex-1">
                    <p className="text-lg font-bold text-slate-800">
                      {v.nombre} {!v.activo && <span className="text-sm font-normal text-slate-400">(inactivo)</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {v.tipo_comision === "porcentaje"
                        ? `${Number(v.valor_comision)}% por venta`
                        : `Gs ${formatoGs.format(v.valor_comision)} por unidad`}
                      {v.telefono && ` · ${v.telefono}`}
                    </p>
                  </Link>
                  {v.activo ? (
                    <button
                      onClick={() => setDesactivando(desactivando === v.id ? null : v.id)}
                      className="shrink-0 text-sm font-medium text-red-500 hover:text-red-700"
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button onClick={() => activar(v.id)} className="shrink-0 text-sm font-medium text-navy hover:text-brand">
                      Activar
                    </button>
                  )}
                </div>

                {desactivando === v.id && (
                  <div className="mt-4 rounded-xl border border-slate-200 p-4">
                    <p className="mb-3 text-sm text-slate-600">
                      ¿Qué hacer con los clientes asignados a {v.nombre}?
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => confirmarDesactivar(v.id, undefined)}
                        className="rounded-xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        Aplicar la política configurada — {ETIQUETA_POLITICA[politicaDefault]}
                      </button>
                      <button
                        onClick={() => confirmarDesactivar(v.id, null)}
                        className="rounded-xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        Dejar sin vendedor asignado
                      </button>
                      <div className="flex gap-2">
                        <select
                          value={reasignarA}
                          onChange={(e) => setReasignarA(e.target.value)}
                          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        >
                          <option value="">— Reasignar a otro vendedor —</option>
                          {vendedoresActivos
                            .filter((va) => va.id !== v.id)
                            .map((va) => (
                              <option key={va.id} value={va.id}>
                                {va.nombre}
                              </option>
                            ))}
                        </select>
                        <button
                          disabled={!reasignarA}
                          onClick={() => confirmarDesactivar(v.id, reasignarA)}
                          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                        >
                          Reasignar
                        </button>
                      </div>
                      <button
                        onClick={() => setDesactivando(null)}
                        className="text-sm font-medium text-slate-400 hover:text-slate-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
