"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const vacio = {
  nombre: "",
  montoMinimo: "",
  beneficioMayoristaAutomatico: false,
  beneficioDescuentoAdicionalPct: "",
  beneficioLineaCreditoExtra: "",
};

function resumenBeneficios(c) {
  const partes = [];
  if (c.beneficio_mayorista_automatico) partes.push("Mayorista automático (contado)");
  if (Number(c.beneficio_descuento_adicional_pct) > 0) partes.push(`${c.beneficio_descuento_adicional_pct}% descuento adicional`);
  if (Number(c.beneficio_linea_credito_extra) > 0) partes.push(`+Gs ${formatoGs.format(c.beneficio_linea_credito_extra)} de crédito`);
  return partes.length > 0 ? partes.join(" · ") : "Sin beneficios";
}

export default function CategoriasCliente() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      const [cats, rep] = await Promise.all([
        apiFetch("/api/clientes/categorias"),
        apiFetch("/api/clientes/reporte-categorias"),
      ]);
      setCategorias(cats);
      setReporte(rep);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        if (u.rol !== "dueno") router.push("/panel");
        else setListo(true);
      })
      .catch(() => router.push("/panel"));
  }, [router]);

  useEffect(() => {
    if (listo) cargar();
  }, [listo]);

  function actualizar(campo) {
    return (e) => {
      const valor = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setForm({ ...form, [campo]: valor });
    };
  }

  function editar(c) {
    setEditandoId(c.id);
    setForm({
      nombre: c.nombre,
      montoMinimo: c.monto_minimo,
      beneficioMayoristaAutomatico: c.beneficio_mayorista_automatico,
      beneficioDescuentoAdicionalPct: c.beneficio_descuento_adicional_pct ?? "",
      beneficioLineaCreditoExtra: c.beneficio_linea_credito_extra ?? "",
    });
  }

  function cancelar() {
    setEditandoId(null);
    setForm(vacio);
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    const body = {
      nombre: form.nombre,
      montoMinimo: Number(form.montoMinimo) || 0,
      beneficioMayoristaAutomatico: !!form.beneficioMayoristaAutomatico,
      beneficioDescuentoAdicionalPct: form.beneficioDescuentoAdicionalPct === "" ? null : Number(form.beneficioDescuentoAdicionalPct),
      beneficioLineaCreditoExtra: form.beneficioLineaCreditoExtra === "" ? null : Number(form.beneficioLineaCreditoExtra),
    };
    try {
      if (editandoId) {
        await apiFetch(`/api/clientes/categorias/${editandoId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/clientes/categorias", { method: "POST", body: JSON.stringify(body) });
      }
      cancelar();
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(c) {
    try {
      await apiFetch(`/api/clientes/categorias/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !c.activo }),
      });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!listo) return null;

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Categorías de clientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Definí tus propias categorías según cuánto compra cada cliente por mes, y qué beneficio le corresponde a
            cada una. Se aplican solas al vender, sin que el cajero tenga que acordarse de nada.
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {reporte && (
          <div className="mb-6 flex flex-wrap gap-3">
            {reporte.categorias.map((c) => (
              <div key={c.id} className="rounded-2xl bg-white px-4 py-3 shadow shadow-slate-200">
                <p className="text-sm text-slate-400">{c.nombre}</p>
                <p className="text-xl font-extrabold text-navy">{c.cantidadClientes}</p>
              </div>
            ))}
            <div className="rounded-2xl bg-white px-4 py-3 shadow shadow-slate-200">
              <p className="text-sm text-slate-400">Sin categoría</p>
              <p className="text-xl font-extrabold text-slate-500">{reporte.sinCategoria}</p>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3">
          {categorias.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-slate-800">
                    {c.nombre} <span className="font-normal text-slate-400">— desde Gs {formatoGs.format(c.monto_minimo)}/mes</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{resumenBeneficios(c)}</p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button onClick={() => editar(c)} className="text-sm font-semibold text-navy hover:text-brand">
                    Editar
                  </button>
                  <button
                    onClick={() => alternarActivo(c)}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {c.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
              {!c.activo && <p className="mt-2 text-xs font-semibold text-slate-400">Inactiva — no se aplica</p>}
            </div>
          ))}
          {categorias.length === 0 && (
            <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
              Todavía no definiste ninguna categoría.
            </p>
          )}
        </div>

        <form onSubmit={guardar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-navy">{editandoId ? "Editar categoría" : "Nueva categoría"}</h2>

          <label className={etiqueta}>Nombre</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Ej: VIP" />

          <label className={etiqueta}>Volumen mensual mínimo (Gs)</label>
          <input
            type="number"
            min="0"
            value={form.montoMinimo}
            onChange={actualizar("montoMinimo")}
            className={campo}
            placeholder="0"
          />

          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.beneficioMayoristaAutomatico}
              onChange={actualizar("beneficioMayoristaAutomatico")}
              className="h-5 w-5"
            />
            <span className="text-sm font-medium text-slate-700">
              Precio mayorista automático (solo en ventas al contado)
            </span>
          </label>

          <label className={etiqueta}>Descuento adicional (%, opcional)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.beneficioDescuentoAdicionalPct}
            onChange={actualizar("beneficioDescuentoAdicionalPct")}
            className={campo}
            placeholder="Sin descuento adicional"
          />

          <label className={etiqueta}>Línea de crédito extra (Gs, opcional)</label>
          <input
            type="number"
            min="0"
            value={form.beneficioLineaCreditoExtra}
            onChange={actualizar("beneficioLineaCreditoExtra")}
            className={campo}
            placeholder="Sin crédito extra"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Crear categoría"}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={cancelar}
                className="rounded-xl bg-slate-100 px-6 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
