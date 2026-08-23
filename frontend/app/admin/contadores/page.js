"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";

const formatoGs = new Intl.NumberFormat("es-PY");

const vacio = { nombre: "", telefono: "", email: "", ruc: "" };

export default function AdminContadores() {
  const router = useRouter();
  const [contadores, setContadores] = useState(null);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  const [recienCreado, setRecienCreado] = useState(null);

  function cargar() {
    return adminFetch("/api/admin/contadores").then((r) => setContadores(r.contadores));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
      return;
    }
    cargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function linkDeRegistro(codigo) {
    return `${window.location.origin}/registro?ref=${codigo}`;
  }

  async function copiarLink(codigo) {
    await navigator.clipboard.writeText(linkDeRegistro(codigo));
  }

  async function crear(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const nuevo = await adminFetch("/api/admin/contadores", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(vacio);
      setCreando(false);
      setRecienCreado(nuevo);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/admin" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Contadores aliados</h1>
          </div>
          <button
            onClick={() => setCreando(true)}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nuevo contador aliado
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {recienCreado && (
          <div className="mb-4 rounded-2xl bg-emerald-50 p-5">
            <p className="font-semibold text-emerald-800">
              Contador creado — código {recienCreado.codigo_referido}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={linkDeRegistro(recienCreado.codigo_referido)}
                className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-600"
              />
              <button
                onClick={() => copiarLink(recienCreado.codigo_referido)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Copiar link
              </button>
            </div>
            <button
              onClick={() => setRecienCreado(null)}
              className="mt-2 text-sm font-medium text-emerald-700 hover:text-emerald-900"
            >
              Cerrar
            </button>
          </div>
        )}

        {creando && (
          <form onSubmit={crear} className="mb-6 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Nuevo contador aliado</h2>
            <label className={etiqueta}>Nombre completo</label>
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className={campo}
            />
            <label className={etiqueta}>Teléfono (WhatsApp)</label>
            <input
              required
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              className={campo}
            />
            <label className={etiqueta}>Email (opcional)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={campo}
            />
            <label className={etiqueta}>RUC (opcional)</label>
            <input
              value={form.ruc}
              onChange={(e) => setForm({ ...form, ruc: e.target.value })}
              className={campo}
              placeholder="Se puede cargar más adelante"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="flex-1 rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
              >
                {guardando ? "Creando..." : "Crear contador"}
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

        {contadores === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : contadores.length === 0 ? (
          <p className="text-slate-500">Todavía no hay contadores aliados registrados.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {contadores.map((c) => (
              <div
                key={c.id}
                onClick={() => router.push(`/admin/contadores/${c.id}`)}
                className="cursor-pointer rounded-2xl bg-white p-5 shadow shadow-slate-200 transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {c.nombre} {!c.activo && <span className="text-sm font-normal text-slate-400">(inactivo)</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {c.codigo_referido} · {c.telefono} · {c.tieneRuc ? "✓ RUC cargado" : "Falta RUC"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-navy">{c.clientesActivos}</p>
                    <p className="text-sm text-slate-400">clientes activos</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Comisión de este mes: <span className="font-semibold">Gs {formatoGs.format(c.comisionMesActual)}</span>
                  </p>
                  {c.superaUmbral && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      Superó el umbral — pedir facturación formal
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
