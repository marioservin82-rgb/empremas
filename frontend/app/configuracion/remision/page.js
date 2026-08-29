"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const campo =
  "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

const VACIO = {
  tipoTransporte: 1,
  modalidad: 1,
  responsableFlete: 5,
  vehiculo: { tipo: "", marca: "", chapa: "" },
  transportista: {
    contribuyente: false,
    nombre: "",
    documentoTipo: 1,
    documentoNumero: "",
    ruc: "",
    direccion: "",
    chofer: { nombre: "", documentoNumero: "", direccion: "" },
  },
};

export default function PresetRemision() {
  const router = useRouter();
  const [p, setP] = useState(VACIO);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/preset-remision")
      .then((r) => {
        if (r.preset) setP({ ...VACIO, ...r.preset, transportista: { ...VACIO.transportista, ...r.preset.transportista, chofer: { ...VACIO.transportista.chofer, ...r.preset.transportista?.chofer } } });
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [router]);

  const setV = (k) => (e) => setP((v) => ({ ...v, vehiculo: { ...v.vehiculo, [k]: e.target.value } }));
  const setT = (k) => (e) => setP((v) => ({ ...v, transportista: { ...v.transportista, [k]: e.target.value } }));
  const setCh = (k) => (e) =>
    setP((v) => ({ ...v, transportista: { ...v.transportista, chofer: { ...v.transportista.chofer, [k]: e.target.value } } }));

  function copiarTransportistaAlChofer() {
    setP((v) => ({
      ...v,
      transportista: {
        ...v.transportista,
        chofer: {
          nombre: v.transportista.nombre,
          documentoNumero: v.transportista.documentoNumero || v.transportista.ruc.split("-")[0],
          direccion: v.transportista.direccion,
        },
      },
    }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setExito(false);
    setGuardando(true);
    try {
      await apiFetch("/api/empresas/preset-remision", {
        method: "PUT",
        body: JSON.stringify({ preset: p }),
      });
      setExito(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="py-6">
          <Link href="/documentos/remision" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Datos de transporte</h1>
          <p className="mt-1 text-sm text-slate-500">
            Se usan por defecto en cada Nota de Remisión (podés cambiarlos en cada envío).
          </p>
        </div>

        <form onSubmit={guardar} className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Vehículo</h2>
          <label className={etiqueta}>Tipo (ej. CAMIONETA, CAMION, MOTO)</label>
          <input value={p.vehiculo.tipo} onChange={setV("tipo")} className={campo} required maxLength={10} />
          <label className={etiqueta}>Marca</label>
          <input value={p.vehiculo.marca} onChange={setV("marca")} className={campo} required maxLength={10} />
          <label className={etiqueta}>Chapa / patente</label>
          <input value={p.vehiculo.chapa} onChange={setV("chapa")} className={campo} required />

          <h2 className="mb-3 mt-4 text-lg font-bold text-slate-800">Transportista</h2>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.transportista.contribuyente}
              onChange={(e) => setP((v) => ({ ...v, transportista: { ...v.transportista, contribuyente: e.target.checked } }))}
            />
            El transportista tiene RUC (es contribuyente)
          </label>
          <label className={etiqueta}>Nombre / Razón social</label>
          <input value={p.transportista.nombre} onChange={setT("nombre")} className={campo} required />
          {p.transportista.contribuyente ? (
            <>
              <label className={etiqueta}>RUC</label>
              <input value={p.transportista.ruc} onChange={setT("ruc")} className={campo} placeholder="80012345-6" />
            </>
          ) : (
            <>
              <label className={etiqueta}>Cédula</label>
              <input value={p.transportista.documentoNumero} onChange={setT("documentoNumero")} className={campo} />
            </>
          )}
          <label className={etiqueta}>Dirección</label>
          <input value={p.transportista.direccion} onChange={setT("direccion")} className={campo} required />

          <h2 className="mb-1 mt-4 text-lg font-bold text-slate-800">Chofer</h2>
          <button
            type="button"
            onClick={copiarTransportistaAlChofer}
            className="mb-3 text-xs font-semibold text-navy hover:text-brand"
          >
            Es la misma persona que el transportista → copiar
          </button>
          <label className={etiqueta}>Nombre</label>
          <input value={p.transportista.chofer.nombre} onChange={setCh("nombre")} className={campo} required minLength={4} />
          <label className={etiqueta}>Cédula</label>
          <input value={p.transportista.chofer.documentoNumero} onChange={setCh("documentoNumero")} className={campo} required />
          <label className={etiqueta}>Dirección</label>
          <input value={p.transportista.chofer.direccion} onChange={setCh("direccion")} className={campo} required minLength={4} />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </form>
      </div>
    </main>
  );
}
