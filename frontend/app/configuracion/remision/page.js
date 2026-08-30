"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const inputMini = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy";

export default function Flota() {
  const router = useRouter();
  const [flota, setFlota] = useState(null);
  const [error, setError] = useState("");

  const cargar = () => apiFetch("/api/flota").then(setFlota).catch((e) => setError(e.message));

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function guardar(ruta, cuerpo, metodo = "POST") {
    setError("");
    try {
      await apiFetch(ruta, { method: metodo, body: JSON.stringify(cuerpo) });
      await cargar();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  if (!flota) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-slate-500">Cargando…</p>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="py-6">
          <Link href="/documentos/remision" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Flota de transporte</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vehículos y choferes propios, y los fleteros que usás. También se pueden cargar en el
            momento de hacer una remisión.
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Seccion titulo="Vehículos">
          {flota.vehiculos.map((v) => (
            <Fila key={v.id} activo>
              <span className="flex-1">
                {v.tipo} {v.marca} · <b>{v.chapa}</b>
                {v.predeterminado && <span className="ml-2 text-xs text-emerald-600">predeterminado</span>}
              </span>
              {!v.predeterminado && (
                <button
                  onClick={() => guardar(`/api/flota/vehiculos/${v.id}`, { predeterminado: true }, "PATCH")}
                  className="text-xs text-navy"
                >
                  usar por defecto
                </button>
              )}
              <button
                onClick={() => guardar(`/api/flota/vehiculos/${v.id}`, { activo: false }, "PATCH")}
                className="text-xs text-red-500"
              >
                quitar
              </button>
            </Fila>
          ))}
          <AltaVehiculo onGuardar={(c) => guardar("/api/flota/vehiculos", c)} />
        </Seccion>

        <Seccion titulo="Choferes">
          {flota.choferes.map((c) => (
            <Fila key={c.id} activo>
              <span className="flex-1">
                {c.nombre} · {c.documento_numero}
                {c.predeterminado && <span className="ml-2 text-xs text-emerald-600">predeterminado</span>}
              </span>
              {!c.predeterminado && (
                <button
                  onClick={() => guardar(`/api/flota/choferes/${c.id}`, { predeterminado: true }, "PATCH")}
                  className="text-xs text-navy"
                >
                  usar por defecto
                </button>
              )}
              <button
                onClick={() => guardar(`/api/flota/choferes/${c.id}`, { activo: false }, "PATCH")}
                className="text-xs text-red-500"
              >
                quitar
              </button>
            </Fila>
          ))}
          <AltaChofer onGuardar={(c) => guardar("/api/flota/choferes", c)} />
        </Seccion>

        <Seccion titulo="Fleteros (transportistas externos)">
          {flota.transportistas.map((t) => (
            <Fila key={t.id} activo>
              <span className="flex-1">
                {t.nombre} · {t.ruc || t.documento_numero}
              </span>
              <button
                onClick={() => guardar(`/api/flota/transportistas/${t.id}`, { activo: false }, "PATCH")}
                className="text-xs text-red-500"
              >
                quitar
              </button>
            </Fila>
          ))}
          <AltaTransportista onGuardar={(c) => guardar("/api/flota/transportistas", c)} />
        </Seccion>
      </div>
    </main>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div className="mb-5 rounded-2xl bg-white p-5 shadow shadow-slate-200">
      <h2 className="mb-3 text-lg font-bold text-slate-800">{titulo}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Fila({ children }) {
  return <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{children}</div>;
}

function AltaVehiculo({ onGuardar }) {
  const [f, setF] = useState({ tipo: "", marca: "", chapa: "" });
  return (
    <div className="mt-1 grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
      <input className={inputMini} placeholder="Tipo (CAMION)" maxLength={10} value={f.tipo} onChange={(e) => setF((v) => ({ ...v, tipo: e.target.value }))} />
      <input className={inputMini} placeholder="Marca" maxLength={10} value={f.marca} onChange={(e) => setF((v) => ({ ...v, marca: e.target.value }))} />
      <input className={inputMini} placeholder="Chapa" value={f.chapa} onChange={(e) => setF((v) => ({ ...v, chapa: e.target.value }))} />
      <button
        onClick={async () => {
          if (await onGuardar(f)) setF({ tipo: "", marca: "", chapa: "" });
        }}
        disabled={!f.tipo || !f.marca || !f.chapa}
        className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        Agregar
      </button>
    </div>
  );
}

function AltaChofer({ onGuardar }) {
  const [f, setF] = useState({ nombre: "", documentoNumero: "", direccion: "" });
  return (
    <div className="mt-1 flex flex-col gap-2">
      <input className={inputMini} placeholder="Nombre y apellido" value={f.nombre} onChange={(e) => setF((v) => ({ ...v, nombre: e.target.value }))} />
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input className={inputMini} placeholder="Cédula" value={f.documentoNumero} onChange={(e) => setF((v) => ({ ...v, documentoNumero: e.target.value }))} />
        <input className={inputMini} placeholder="Dirección" value={f.direccion} onChange={(e) => setF((v) => ({ ...v, direccion: e.target.value }))} />
        <button
          onClick={async () => {
            if (await onGuardar(f)) setF({ nombre: "", documentoNumero: "", direccion: "" });
          }}
          disabled={f.nombre.length < 4 || !f.documentoNumero || f.direccion.length < 4}
          className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

function AltaTransportista({ onGuardar }) {
  const [f, setF] = useState({ contribuyente: false, nombre: "", ruc: "", documentoNumero: "", direccion: "" });
  const listo = f.nombre && f.direccion && (f.contribuyente ? f.ruc : f.documentoNumero);
  return (
    <div className="mt-1 flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={f.contribuyente} onChange={(e) => setF((v) => ({ ...v, contribuyente: e.target.checked }))} />
        Tiene RUC (es contribuyente)
      </label>
      <input className={inputMini} placeholder="Nombre / razón social" value={f.nombre} onChange={(e) => setF((v) => ({ ...v, nombre: e.target.value }))} />
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        {f.contribuyente ? (
          <input className={inputMini} placeholder="RUC (80012345-6)" value={f.ruc} onChange={(e) => setF((v) => ({ ...v, ruc: e.target.value }))} />
        ) : (
          <input className={inputMini} placeholder="Cédula" value={f.documentoNumero} onChange={(e) => setF((v) => ({ ...v, documentoNumero: e.target.value }))} />
        )}
        <input className={inputMini} placeholder="Dirección" value={f.direccion} onChange={(e) => setF((v) => ({ ...v, direccion: e.target.value }))} />
        <button
          onClick={async () => {
            if (await onGuardar(f)) setF({ contribuyente: false, nombre: "", ruc: "", documentoNumero: "", direccion: "" });
          }}
          disabled={!listo}
          className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
