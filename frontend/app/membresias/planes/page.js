"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");
const campo =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

const FORM_VACIO = { nombre: "", precioMensual: "", descuentoServiciosPct: "0", diasGracia: "5", tasaIva: "10", descripcion: "" };

export default function PlanesMembresia() {
  const router = useRouter();
  const [planes, setPlanes] = useState(null);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch("/api/membresias/planes")
      .then((d) => setPlanes(d.planes))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        if (u.rol !== "dueno") router.push("/panel");
      })
      .catch(() => {});
    cargar();
  }, [router, cargar]);

  const actualizar = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function abrirEdicion(p) {
    setCreando(false);
    setEditandoId(p.id);
    setForm({
      nombre: p.nombre,
      precioMensual: String(p.precioMensual),
      descuentoServiciosPct: String(p.descuentoServiciosPct),
      diasGracia: String(p.diasGracia),
      tasaIva: String(p.tasaIva ?? 10),
      descripcion: p.descripcion || "",
    });
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    const cuerpo = {
      nombre: form.nombre,
      precioMensual: Number(form.precioMensual),
      descuentoServiciosPct: Number(form.descuentoServiciosPct || 0),
      diasGracia: Number(form.diasGracia || 0),
      tasaIva: Number(form.tasaIva),
      descripcion: form.descripcion,
    };
    try {
      if (editandoId) {
        await apiFetch(`/api/membresias/planes/${editandoId}`, { method: "PATCH", body: JSON.stringify(cuerpo) });
      } else {
        await apiFetch("/api/membresias/planes", { method: "POST", body: JSON.stringify(cuerpo) });
      }
      setCreando(false);
      setEditandoId(null);
      setForm(FORM_VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(p) {
    setError("");
    try {
      await apiFetch(`/api/membresias/planes/${p.id}`, { method: "PATCH", body: JSON.stringify({ activo: !p.activo }) });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const formulario = (
    <form onSubmit={guardar} className="mb-5 rounded-2xl bg-white p-5 shadow shadow-slate-200">
      <p className="mb-3 text-lg font-bold text-slate-800">{editandoId ? "Editar plan" : "Nuevo plan"}</p>

      <label className={etiqueta}>Nombre del plan</label>
      <input value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Ej.: Oro" maxLength={60} required />

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>Cuota mensual (Gs)</label>
          <input type="number" min="1" value={form.precioMensual} onChange={actualizar("precioMensual")} className={campo} required />
        </div>
        <div>
          <label className={etiqueta}>Descuento en servicios (%)</label>
          <input type="number" min="0" max="100" step="0.5" value={form.descuentoServiciosPct} onChange={actualizar("descuentoServiciosPct")} className={campo} />
        </div>
        <div>
          <label className={etiqueta}>Días de gracia tras vencer</label>
          <input type="number" min="0" max="60" value={form.diasGracia} onChange={actualizar("diasGracia")} className={campo} />
        </div>
        <div>
          <label className={etiqueta}>IVA de la cuota</label>
          <select value={form.tasaIva} onChange={actualizar("tasaIva")} className={campo}>
            <option value="10">10%</option>
            <option value="5">5%</option>
            <option value="0">Exenta</option>
          </select>
        </div>
      </div>

      <label className={`${etiqueta} mt-3`}>Descripción (opcional)</label>
      <input value={form.descripcion} onChange={actualizar("descripcion")} className={campo} placeholder="Ej.: Corte ilimitado y 10% en tratamientos" maxLength={300} />

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={guardando} className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCreando(false);
            setEditandoId(null);
          }}
          className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200"
        >
          Cancelar
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Al guardar, el servicio “Cuota Membresía {form.nombre || "…"}” se crea (o se actualiza) solo, con este precio.
        Cambiar el precio no modifica los períodos ya pagados.
      </p>
    </form>
  );

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <Link href="/membresias" className="text-sm font-semibold text-slate-400 hover:text-navy">
              ← Membresías
            </Link>
            <h1 className="text-2xl font-bold text-navy">Planes</h1>
          </div>
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

        {(creando || editandoId) && formulario}

        {planes === null ? (
          <p className="text-slate-400">Cargando…</p>
        ) : (
          <>
            {planes.length === 0 && !creando && (
              <p className="mb-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-slate-500">Todavía no creaste ningún plan.</p>
            )}
            <div className="flex flex-col gap-3">
              {planes.map((p) => (
                <div key={p.id} className={`rounded-2xl bg-white p-4 shadow shadow-slate-200 ${p.activo ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold text-slate-800">{p.nombre}</p>
                    {!p.activo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">Desactivado</span>}
                  </div>
                  <p className="text-sm text-slate-500">
                    Gs {formatoGs.format(p.precioMensual)}/mes · {p.descuentoServiciosPct}% en servicios · {p.diasGracia} días de gracia
                  </p>
                  {p.descripcion && <p className="text-sm text-slate-400">{p.descripcion}</p>}
                  <p className="text-xs text-slate-400">{p.membresiasVigentes} membresía{p.membresiasVigentes === 1 ? "" : "s"} vigente{p.membresiasVigentes === 1 ? "" : "s"}</p>
                  <div className="mt-3 flex gap-2 text-sm font-semibold">
                    <button onClick={() => abrirEdicion(p)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200">
                      Editar
                    </button>
                    <button onClick={() => cambiarActivo(p)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200">
                      {p.activo ? "Desactivar" : "Reactivar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!creando && !editandoId && (
              <button
                onClick={() => {
                  setForm(FORM_VACIO);
                  setCreando(true);
                }}
                className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light"
              >
                + Agregar plan
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
