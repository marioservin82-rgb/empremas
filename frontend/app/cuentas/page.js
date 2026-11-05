"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const campo =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

const TIPOS = [
  { valor: "cuenta_corriente", texto: "Cuenta corriente" },
  { valor: "caja_ahorro", texto: "Caja de ahorro" },
  { valor: "billetera", texto: "Billetera (Tigo Money, Personal Pay…)" },
];
const TEXTO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.texto]));

const FORM_VACIO = { nombre: "", banco: "", tipo: "cuenta_corriente", numeroCuenta: "", titular: "" };

export default function CuentasPagina() {
  const router = useRouter();
  const [cuentas, setCuentas] = useState(null);
  const [esDueno, setEsDueno] = useState(false);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch("/api/cuentas")
      .then((d) => setCuentas(d.cuentas))
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
        setEsDueno(u.rol === "dueno");
      })
      .catch(() => {});
    cargar();
  }, [router, cargar]);

  const actualizar = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function abrirNueva() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setCreando(true);
  }

  function abrirEdicion(c) {
    setCreando(false);
    setEditandoId(c.id);
    setForm({
      nombre: c.nombre,
      banco: c.banco || "",
      tipo: c.tipo,
      numeroCuenta: c.numero_cuenta || "",
      titular: c.titular || "",
    });
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (editandoId) {
        await apiFetch(`/api/cuentas/${editandoId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/api/cuentas", { method: "POST", body: JSON.stringify(form) });
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

  async function cambiar(id, cambios) {
    setError("");
    try {
      await apiFetch(`/api/cuentas/${id}`, { method: "PATCH", body: JSON.stringify(cambios) });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const formulario = (
    <form onSubmit={guardar} className="mb-5 rounded-2xl bg-white p-5 shadow shadow-slate-200">
      <p className="mb-3 text-lg font-bold text-slate-800">{editandoId ? "Editar cuenta" : "Nueva cuenta"}</p>

      <label className={etiqueta}>Nombre (así la ve el cajero)</label>
      <input value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Ej.: Itaú cta. cte." maxLength={80} required />

      <label className={`${etiqueta} mt-3`}>Tipo</label>
      <select value={form.tipo} onChange={actualizar("tipo")} className={campo}>
        {TIPOS.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.texto}
          </option>
        ))}
      </select>

      <label className={`${etiqueta} mt-3`}>Banco o billetera (opcional)</label>
      <input value={form.banco} onChange={actualizar("banco")} className={campo} placeholder="Itaú, Ueno, Tigo Money…" maxLength={80} />

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={etiqueta}>N° de cuenta (opcional)</label>
          <input value={form.numeroCuenta} onChange={actualizar("numeroCuenta")} className={campo} maxLength={60} />
        </div>
        <div>
          <label className={etiqueta}>Titular (opcional)</label>
          <input value={form.titular} onChange={actualizar("titular")} className={campo} maxLength={100} />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
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
    </form>
  );

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <Link href="/panel" className="text-sm font-semibold text-slate-400 hover:text-navy">
              ← Panel
            </Link>
            <h1 className="text-2xl font-bold text-navy">🏦 Cuentas bancarias</h1>
          </div>
          <Link href="/cuentas/movimientos" className="text-sm font-semibold text-navy hover:text-brand">
            Ver movimientos
          </Link>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Cargá las cuentas donde recibís o desde donde pagás por transferencia. Cuando hay cuentas cargadas, al cobrar o pagar
          por transferencia hay que elegir una (la principal viene preseleccionada) y se puede anotar el N° de operación.
        </p>

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

        {(creando || editandoId) && formulario}

        {cuentas === null ? (
          <p className="text-slate-400">Cargando…</p>
        ) : (
          <>
            {cuentas.length === 0 && !creando && (
              <p className="mb-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-slate-500">
                Todavía no cargaste ninguna cuenta. Mientras no cargues, las transferencias se registran como hasta ahora (sin cuenta).
              </p>
            )}
            <div className="flex flex-col gap-3">
              {cuentas.map((c) => (
                <div key={c.id} className={`rounded-2xl bg-white p-4 shadow shadow-slate-200 ${c.activa ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold text-slate-800">{c.nombre}</p>
                    {c.es_principal && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Principal</span>
                    )}
                    {!c.activa && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">Desactivada</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {TEXTO_TIPO[c.tipo]}
                    {c.banco ? ` · ${c.banco}` : ""}
                    {c.numero_cuenta ? ` · N° ${c.numero_cuenta}` : ""}
                  </p>
                  {c.titular && <p className="text-sm text-slate-400">Titular: {c.titular}</p>}
                  {esDueno && (
                    <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                      <button onClick={() => abrirEdicion(c)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200">
                        Editar
                      </button>
                      {c.activa && !c.es_principal && (
                        <button
                          onClick={() => cambiar(c.id, { esPrincipal: true })}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200"
                        >
                          Hacer principal
                        </button>
                      )}
                      <button
                        onClick={() => cambiar(c.id, { activa: !c.activa })}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-slate-200"
                      >
                        {c.activa ? "Desactivar" : "Reactivar"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {esDueno && !creando && !editandoId && (
              <button onClick={abrirNueva} className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light">
                + Agregar cuenta
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
