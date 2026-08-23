"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";

const formatoGs = new Intl.NumberFormat("es-PY");

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function etiquetaPeriodo(periodo) {
  const [anio, mes] = periodo.slice(0, 7).split("-");
  const nombre = new Date(Number(anio), Number(mes) - 1, 1).toLocaleDateString("es-PY", {
    month: "long",
    year: "numeric",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

export default function AdminContadorDetalle() {
  const router = useRouter();
  const { id } = useParams();

  const [datos, setDatos] = useState(null);
  const [periodo, setPeriodo] = useState(mesActual());
  const [comisiones, setComisiones] = useState(null);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [marcando, setMarcando] = useState(false);

  function cargar() {
    return adminFetch(`/api/admin/contadores/${id}`).then((r) => {
      setDatos(r);
      setForm({
        nombre: r.contador.nombre,
        telefono: r.contador.telefono,
        email: r.contador.email || "",
        ruc: r.contador.ruc || "",
      });
    });
  }

  function cargarComisiones(p) {
    return adminFetch(`/api/admin/contadores/${id}/comisiones?periodo=${p}`).then(setComisiones);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
      return;
    }
    cargar().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    if (!datos) return;
    cargarComisiones(periodo).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, periodo]);

  async function guardarDatos(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await adminFetch(`/api/admin/contadores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: form.nombre,
          telefono: form.telefono,
          email: form.email || null,
          ruc: form.ruc || null,
        }),
      });
      setEditando(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarPagado() {
    setMarcando(true);
    setError("");
    try {
      await adminFetch(`/api/admin/contadores/${id}/comisiones/marcar-pagado`, {
        method: "POST",
        body: JSON.stringify({ periodo, pagado: !comisiones.pagado }),
      });
      await cargarComisiones(periodo);
    } catch (err) {
      setError(err.message);
    } finally {
      setMarcando(false);
    }
  }

  function linkDeRegistro(codigo) {
    return `${window.location.origin}/registro?ref=${codigo}`;
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100";
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

  const { contador, empresas, historico } = datos;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6">
          <Link href="/admin/contadores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{contador.nombre}</h1>
          <p className="text-sm text-slate-400">{contador.codigo_referido}</p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Datos de contacto</h2>
            {!editando && (
              <button onClick={() => setEditando(true)} className="text-sm font-semibold text-navy hover:text-brand">
                Editar
              </button>
            )}
          </div>

          {editando ? (
            <form onSubmit={guardarDatos}>
              <label className={etiqueta}>Nombre</label>
              <input
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className={campo}
              />
              <label className={etiqueta}>Teléfono</label>
              <input
                required
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className={campo}
              />
              <label className={etiqueta}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={campo}
              />
              <label className={etiqueta}>RUC</label>
              <input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} className={campo} />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                >
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="rounded-xl bg-slate-100 px-6 py-3 font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="text-sm text-slate-600">
              <p>Teléfono: {contador.telefono}</p>
              <p>Email: {contador.email || "—"}</p>
              <p>RUC: {contador.ruc || "Falta cargar"}</p>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
            <input
              readOnly
              value={linkDeRegistro(contador.codigo_referido)}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            />
            <button
              onClick={() => navigator.clipboard.writeText(linkDeRegistro(contador.codigo_referido))}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-2"
            >
              Copiar link
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Comisión de {etiquetaPeriodo(periodo)}</h2>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
            />
          </div>

          {!comisiones ? (
            <p className="text-slate-500">Cargando...</p>
          ) : comisiones.items.length === 0 ? (
            <p className="text-slate-500">Sin clientes activos referidos en este período.</p>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-slate-100">
                {comisiones.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{it.razon_social}</p>
                      <p className="text-slate-400">Plan Gs {formatoGs.format(it.monto_plan)}</p>
                    </div>
                    <p className="font-semibold text-navy">Gs {formatoGs.format(it.comision)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <p className="text-lg font-bold text-slate-800">Total</p>
                <p className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(comisiones.total)}</p>
              </div>
              <button
                onClick={alternarPagado}
                disabled={marcando}
                className={`mt-4 w-full rounded-xl py-3 font-semibold text-white transition disabled:opacity-60 ${
                  comisiones.pagado ? "bg-slate-500 hover:bg-slate-600" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {comisiones.pagado ? "Marcar como pendiente" : "Marcar como pagado"}
              </button>
            </>
          )}
        </div>

        {historico.length > 0 && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Histórico</h2>
            <div className="flex flex-col divide-y divide-slate-100">
              {historico.map((h) => (
                <div key={h.periodo} className="flex items-center justify-between py-2 text-sm">
                  <button onClick={() => setPeriodo(h.periodo.slice(0, 7))} className="font-semibold text-navy hover:text-brand">
                    {etiquetaPeriodo(h.periodo)}
                  </button>
                  <div className="flex items-center gap-3">
                    <span>Gs {formatoGs.format(h.total)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        h.pagado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {h.pagado ? "Pagado" : "Pendiente"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Empresas referidas</h2>
          {empresas.length === 0 ? (
            <p className="text-slate-500">Todavía no trajo ningún cliente.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {empresas.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <p className="font-semibold text-slate-800">{e.razon_social}</p>
                  <p className="text-slate-400">
                    {e.estado} {e.monto_plan_mensual && `· Gs ${formatoGs.format(e.monto_plan_mensual)}/mes`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
