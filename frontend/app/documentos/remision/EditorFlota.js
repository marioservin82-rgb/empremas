"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

const inputMini = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy";

// Formulario chico para corregir un vehículo, chofer o transportista ya
// cargado. `tipo` es el segmento de la ruta de /api/flota: "vehiculos",
// "choferes" o "transportistas". Llama a `onGuardado(registroActualizado)`.
export default function EditorFlota({ tipo, item, onGuardado, onCancelar }) {
  const [f, setF] = useState(() => ({
    tipo: item.tipo || "",
    marca: item.marca || "",
    chapa: item.chapa || "",
    nombre: item.nombre || "",
    documentoNumero: item.documento_numero || "",
    direccion: item.direccion || "",
    contribuyente: !!item.contribuyente,
    ruc: item.ruc || "",
  }));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));

  async function guardar() {
    setError("");
    setGuardando(true);
    try {
      let cuerpo;
      if (tipo === "vehiculos") cuerpo = { tipo: f.tipo, marca: f.marca, chapa: f.chapa };
      else if (tipo === "choferes")
        cuerpo = { nombre: f.nombre, documentoNumero: f.documentoNumero, direccion: f.direccion };
      else
        cuerpo = {
          contribuyente: f.contribuyente,
          nombre: f.nombre,
          direccion: f.direccion,
          ...(f.contribuyente ? { ruc: f.ruc } : { documentoNumero: f.documentoNumero }),
        };
      const actualizado = await apiFetch(`/api/flota/${tipo}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(cuerpo),
      });
      onGuardado(actualizado);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-navy/30 bg-white p-3">
      {tipo === "vehiculos" && (
        <div className="grid grid-cols-3 gap-2">
          <input className={inputMini} placeholder="Tipo" maxLength={10} value={f.tipo} onChange={cambiar("tipo")} />
          <input className={inputMini} placeholder="Marca" maxLength={10} value={f.marca} onChange={cambiar("marca")} />
          <input className={inputMini} placeholder="Chapa" value={f.chapa} onChange={cambiar("chapa")} />
        </div>
      )}

      {tipo === "choferes" && (
        <>
          <input className={inputMini} placeholder="Nombre y apellido" value={f.nombre} onChange={cambiar("nombre")} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputMini} placeholder="Cédula" value={f.documentoNumero} onChange={cambiar("documentoNumero")} />
            <input className={inputMini} placeholder="Dirección" value={f.direccion} onChange={cambiar("direccion")} />
          </div>
        </>
      )}

      {tipo === "transportistas" && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={f.contribuyente}
              onChange={(e) => setF((v) => ({ ...v, contribuyente: e.target.checked }))}
            />
            Tiene RUC (es contribuyente)
          </label>
          <input className={inputMini} placeholder="Nombre / razón social" value={f.nombre} onChange={cambiar("nombre")} />
          <div className="grid grid-cols-2 gap-2">
            {f.contribuyente ? (
              <input className={inputMini} placeholder="RUC (80012345-6)" value={f.ruc} onChange={cambiar("ruc")} />
            ) : (
              <input className={inputMini} placeholder="Cédula" value={f.documentoNumero} onChange={cambiar("documentoNumero")} />
            )}
            <input className={inputMini} placeholder="Dirección" value={f.direccion} onChange={cambiar("direccion")} />
          </div>
        </>
      )}

      <p className="text-xs text-slate-400">
        Corrige este registro. No cambia lo que ya se envió a SIFEN; las remisiones anteriores van a
        mostrar el dato corregido al volver a imprimirlas.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-lg px-3 py-2 text-sm text-slate-500">
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
