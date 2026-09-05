"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const vacio = { nombre: "", telefono: "", sucursalId: "", vendedorId: "" };

export default function Profesionales() {
  const router = useRouter();
  const [profesionales, setProfesionales] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [comisionesHabilitadas, setComisionesHabilitadas] = useState(false);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    return apiFetch("/api/citas/profesionales").then(setProfesionales);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((err) => setError(err.message));
    apiFetch("/api/sucursales")
      .then((s) => {
        setSucursales(s);
        setForm((f) => ({ ...f, sucursalId: f.sucursalId || s[0]?.id || "" }));
      })
      .catch(() => {});
    apiFetch("/api/empresas/actual")
      .then((e) => setComisionesHabilitadas(!!e.comisiones_habilitadas))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!comisionesHabilitadas) return;
    apiFetch("/api/vendedores?activo=true")
      .then(setVendedores)
      .catch(() => {});
  }, [comisionesHabilitadas]);

  async function crear(e) {
    e.preventDefault();
    setError("");
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (!form.sucursalId) {
      setError("Elegí en qué sucursal atiende");
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/api/citas/profesionales", {
        method: "POST",
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          telefono: form.telefono || undefined,
          sucursalId: form.sucursalId,
          vendedorId: form.vendedorId || undefined,
        }),
      });
      setForm({ ...vacio, sucursalId: form.sucursalId });
      setCreando(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(id, activo) {
    setError("");
    try {
      await apiFetch(`/api/citas/profesionales/${id}`, { method: "PATCH", body: JSON.stringify({ activo }) });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/citas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver a la agenda
            </Link>
            <h1 className="text-2xl font-bold text-navy">Profesionales</h1>
          </div>
          <button
            onClick={() => setCreando(true)}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
          >
            + Nuevo profesional
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {creando && (
          <form onSubmit={crear} className="mb-6 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-navy">Nuevo profesional</h2>
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
            {sucursales.length > 1 && (
              <>
                <label className={etiqueta}>Sucursal donde atiende</label>
                <select
                  value={form.sucursalId}
                  onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
                  className={campo}
                >
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </>
            )}
            {comisionesHabilitadas && (
              <>
                <label className={etiqueta}>Vendedor vinculado (opcional)</label>
                <select
                  value={form.vendedorId}
                  onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}
                  className={campo}
                >
                  <option value="">— Ninguno —</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </select>
                <p className="-mt-3 mb-4 text-xs text-slate-400">
                  Si lo vinculás a un vendedor, cobrarle una cita a este profesional le atribuye la comisión de esa
                  venta.
                </p>
              </>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
              >
                {guardando ? "Creando..." : "Crear profesional"}
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

        {profesionales === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : profesionales.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
            Todavía no hay profesionales cargados.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {profesionales.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div>
                  <p className="text-lg font-bold text-slate-800">
                    {p.nombre} {!p.activo && <span className="text-sm font-normal text-slate-400">(inactivo)</span>}
                  </p>
                  <p className="text-sm text-slate-400">
                    {p.telefono && `${p.telefono} · `}
                    {p.vendedor_nombre ? `Comisiona como ${p.vendedor_nombre}` : "Sin comisión vinculada"}
                  </p>
                </div>
                {p.activo ? (
                  <button
                    onClick={() => cambiarActivo(p.id, false)}
                    className="shrink-0 text-sm font-medium text-red-500 hover:text-red-700"
                  >
                    Desactivar
                  </button>
                ) : (
                  <button onClick={() => cambiarActivo(p.id, true)} className="shrink-0 text-sm font-medium text-navy hover:text-brand">
                    Activar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
