"use client";

import { useRef } from "react";
import { imprimirTicket } from "@/lib/agenteImpresion";

const formatoGs = new Intl.NumberFormat("es-PY");

const SEPARADOR = { texto: "--------------------------------" };

function lineasComprobanteTraslado(empresa, traslado, sucursalDestinoNombre, fecha) {
  const lineas = [
    { texto: empresa.razon_social, negrita: true, alineacion: "centro" },
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
    { texto: "COMPROBANTE DE TRASLADO", negrita: true, alineacion: "centro" },
    { texto: `Traslado N° ${traslado.numero}`, alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
    SEPARADOR,
    { texto: `Destino: ${sucursalDestinoNombre}`, negrita: true },
    SEPARADOR,
    { texto: "Productos:" },
  ];
  for (const i of traslado.items) {
    lineas.push({ texto: `${i.nombre} x${formatoGs.format(i.cantidad)}` });
  }
  lineas.push(
    SEPARADOR,
    { texto: "" },
    { texto: "Despacha:" },
    { texto: "" },
    { texto: "" },
    { texto: "____________________________", alineacion: "centro" },
    { texto: "" },
    { texto: "Recibe (en destino):" },
    { texto: "" },
    { texto: "" },
    { texto: "____________________________", alineacion: "centro" }
  );
  return lineas;
}

export default function ComprobanteTraslado({ empresa, traslado, sucursalDestinoNombre, onNuevoTraslado }) {
  const fecha = new Date(traslado.creadoEn);
  const recuadroRef = useRef(null);

  function imprimir() {
    imprimirTicket(
      empresa.impresora_agente_nombre,
      lineasComprobanteTraslado(empresa, traslado, sucursalDestinoNombre, fecha),
      () => window.print()
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <style>{"@page { size: 80mm auto; margin: 0; }"}</style>
      <div
        ref={recuadroRef}
        className="recibo-imprimible w-[80mm] rounded-xl bg-white p-[3mm] text-base text-slate-800 shadow"
        style={{ zoom: (empresa.ticket_escala ?? 100) / 100 }}
      >
        <p className="text-center text-2xl font-bold">{empresa.razon_social}</p>
        <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
        <p className="mt-2 text-center text-lg font-bold">COMPROBANTE DE TRASLADO</p>
        <p className="text-center text-sm text-slate-500">Traslado N° {traslado.numero}</p>
        <p className="text-center text-sm text-slate-500">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="font-semibold">Destino: {sucursalDestinoNombre}</p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="mb-1 text-sm font-medium text-slate-500">Productos</p>
        {traslado.items.map((i) => (
          <div key={i.productoId} className="flex justify-between text-sm">
            <span>{i.nombre}</span>
            <span>x{formatoGs.format(i.cantidad)}</span>
          </div>
        ))}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="text-sm">Despacha</p>
        <div className="mt-8 border-t border-slate-400" />

        <p className="mt-4 text-sm">Recibe (en destino)</p>
        <div className="mt-8 border-t border-slate-400" />
      </div>

      <div className="flex gap-2 print:hidden">
        <button onClick={imprimir} className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light">
          Imprimir
        </button>
      </div>

      <button onClick={onNuevoTraslado} className="text-sm font-semibold text-navy hover:text-brand print:hidden">
        + Nuevo traslado
      </button>
    </div>
  );
}
