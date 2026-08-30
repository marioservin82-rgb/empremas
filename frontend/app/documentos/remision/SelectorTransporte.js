"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const campo =
  "mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

const MODOS = [
  { v: "propio", t: "Con nuestro transporte", d: "Nuestro camión y nuestro chofer" },
  { v: "fletero", t: "Con un fletero", d: "Un transportista contratado" },
  { v: "cliente_retira", t: "El cliente lo retira", d: "El cliente viene con su propio vehículo" },
];
const QUIEN_PAGA = [
  { v: "nosotros", t: "Nosotros" },
  { v: "cliente", t: "El cliente" },
  { v: "tercero", t: "Un tercero" },
];
const NUEVO = "__nuevo__";

// Bloque de datos de transporte de una remisión. Llama a `onChange` con el
// objeto que el formulario debe mandar en el body:
//   { modoTransporte, vehiculoId|vehiculoNuevo, choferId|choferNuevo,
//     transportistaId|transportistaNuevo, quienPagaFlete }
export default function SelectorTransporte({ onChange }) {
  const [flota, setFlota] = useState({ vehiculos: [], choferes: [], transportistas: [] });

  const [modo, setModo] = useState("propio");
  const [quienPaga, setQuienPaga] = useState("nosotros");

  const [vehiculoId, setVehiculoId] = useState("");
  const [vehiculoNuevo, setVehiculoNuevo] = useState({ tipo: "", marca: "", chapa: "" });
  const [choferId, setChoferId] = useState("");
  const [choferNuevo, setChoferNuevo] = useState({ nombre: "", documentoNumero: "", direccion: "" });
  const [transportistaId, setTransportistaId] = useState("");
  const [transportistaNuevo, setTransportistaNuevo] = useState({
    contribuyente: false,
    nombre: "",
    ruc: "",
    documentoNumero: "",
    direccion: "",
  });

  useEffect(() => {
    apiFetch("/api/flota")
      .then((f) => {
        setFlota(f);
        const vPred = f.vehiculos.find((x) => x.predeterminado) || f.vehiculos[0];
        const cPred = f.choferes.find((x) => x.predeterminado) || f.choferes[0];
        setVehiculoId(vPred ? vPred.id : NUEVO);
        setChoferId(cPred ? cPred.id : NUEVO);
        setTransportistaId(f.transportistas[0] ? f.transportistas[0].id : NUEVO);
      })
      .catch(() => {});
  }, []);

  // Reporta el estado al formulario padre cada vez que cambia algo.
  useEffect(() => {
    const out = { modoTransporte: modo };
    if (vehiculoId === NUEVO) out.vehiculoNuevo = vehiculoNuevo;
    else if (vehiculoId) out.vehiculoId = vehiculoId;
    if (choferId === NUEVO) out.choferNuevo = choferNuevo;
    else if (choferId) out.choferId = choferId;
    if (modo === "fletero") {
      out.quienPagaFlete = quienPaga;
      if (transportistaId === NUEVO) out.transportistaNuevo = transportistaNuevo;
      else if (transportistaId) out.transportistaId = transportistaId;
    }
    onChange(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, quienPaga, vehiculoId, vehiculoNuevo, choferId, choferNuevo, transportistaId, transportistaNuevo]);

  const inputMini = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy";

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className={etiqueta}>¿Cómo se traslada la mercadería?</p>
      <div className="mb-4 flex flex-col gap-2">
        {MODOS.map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => setModo(m.v)}
            className={`rounded-xl border px-3 py-2 text-left text-sm ${
              modo === m.v ? "border-navy bg-navy/5 font-semibold text-navy" : "border-slate-200 text-slate-600"
            }`}
          >
            {m.t}
            <span className="block text-xs font-normal text-slate-400">{m.d}</span>
          </button>
        ))}
      </div>

      {/* Vehículo */}
      <label className={etiqueta}>Vehículo</label>
      <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} className={campo}>
        {flota.vehiculos.map((v) => (
          <option key={v.id} value={v.id}>
            {v.tipo} {v.marca} · {v.chapa}
          </option>
        ))}
        <option value={NUEVO}>➕ Otro vehículo…</option>
      </select>
      {vehiculoId === NUEVO && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <input
            className={inputMini}
            placeholder="Tipo (CAMION)"
            maxLength={10}
            value={vehiculoNuevo.tipo}
            onChange={(e) => setVehiculoNuevo((v) => ({ ...v, tipo: e.target.value }))}
          />
          <input
            className={inputMini}
            placeholder="Marca"
            maxLength={10}
            value={vehiculoNuevo.marca}
            onChange={(e) => setVehiculoNuevo((v) => ({ ...v, marca: e.target.value }))}
          />
          <input
            className={inputMini}
            placeholder="Chapa"
            value={vehiculoNuevo.chapa}
            onChange={(e) => setVehiculoNuevo((v) => ({ ...v, chapa: e.target.value }))}
          />
        </div>
      )}

      {/* Chofer */}
      <label className={etiqueta}>Chofer</label>
      <select value={choferId} onChange={(e) => setChoferId(e.target.value)} className={campo}>
        {flota.choferes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} · {c.documento_numero}
          </option>
        ))}
        <option value={NUEVO}>➕ Otro chofer…</option>
      </select>
      {choferId === NUEVO && (
        <div className="mb-3 flex flex-col gap-2">
          <input
            className={inputMini}
            placeholder="Nombre y apellido"
            value={choferNuevo.nombre}
            onChange={(e) => setChoferNuevo((c) => ({ ...c, nombre: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputMini}
              placeholder="Cédula"
              value={choferNuevo.documentoNumero}
              onChange={(e) => setChoferNuevo((c) => ({ ...c, documentoNumero: e.target.value }))}
            />
            <input
              className={inputMini}
              placeholder="Dirección"
              value={choferNuevo.direccion}
              onChange={(e) => setChoferNuevo((c) => ({ ...c, direccion: e.target.value }))}
            />
          </div>
        </div>
      )}

      {/* Transportista (solo fletero) */}
      {modo === "fletero" && (
        <>
          <label className={etiqueta}>Transportista (fletero)</label>
          <select
            value={transportistaId}
            onChange={(e) => setTransportistaId(e.target.value)}
            className={campo}
          >
            {flota.transportistas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} {t.ruc ? `· ${t.ruc}` : t.documento_numero ? `· ${t.documento_numero}` : ""}
              </option>
            ))}
            <option value={NUEVO}>➕ Otro transportista…</option>
          </select>
          {transportistaId === NUEVO && (
            <div className="mb-3 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={transportistaNuevo.contribuyente}
                  onChange={(e) =>
                    setTransportistaNuevo((t) => ({ ...t, contribuyente: e.target.checked }))
                  }
                />
                Tiene RUC (es contribuyente)
              </label>
              <input
                className={inputMini}
                placeholder="Nombre / razón social"
                value={transportistaNuevo.nombre}
                onChange={(e) => setTransportistaNuevo((t) => ({ ...t, nombre: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                {transportistaNuevo.contribuyente ? (
                  <input
                    className={inputMini}
                    placeholder="RUC (80012345-6)"
                    value={transportistaNuevo.ruc}
                    onChange={(e) => setTransportistaNuevo((t) => ({ ...t, ruc: e.target.value }))}
                  />
                ) : (
                  <input
                    className={inputMini}
                    placeholder="Cédula"
                    value={transportistaNuevo.documentoNumero}
                    onChange={(e) =>
                      setTransportistaNuevo((t) => ({ ...t, documentoNumero: e.target.value }))
                    }
                  />
                )}
                <input
                  className={inputMini}
                  placeholder="Dirección"
                  value={transportistaNuevo.direccion}
                  onChange={(e) => setTransportistaNuevo((t) => ({ ...t, direccion: e.target.value }))}
                />
              </div>
            </div>
          )}

          <label className={etiqueta}>¿Quién paga el flete?</label>
          <div className="mb-1 grid grid-cols-3 gap-2">
            {QUIEN_PAGA.map((q) => (
              <button
                key={q.v}
                type="button"
                onClick={() => setQuienPaga(q.v)}
                className={`rounded-lg py-2 text-sm font-semibold ${
                  quienPaga === q.v ? "bg-navy text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {q.t}
              </button>
            ))}
          </div>
        </>
      )}

      {modo === "cliente_retira" && (
        <p className="text-xs text-slate-400">
          El transportista de la remisión va a ser el cliente (con sus datos). El vehículo y el chofer
          son los que trae el cliente — cargalos arriba si no están en la lista.
        </p>
      )}
      {modo === "propio" && (
        <p className="text-xs text-slate-400">El transportista de la remisión es la propia empresa.</p>
      )}
    </div>
  );
}
