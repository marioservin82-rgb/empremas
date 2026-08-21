"use client";

import { useEffect, useRef } from "react";
import { imprimirTicket } from "@/lib/agenteImpresion";
import { montoEnLetras } from "@/lib/numeroALetras";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_MOTIVO = {
  pago_proveedor: "Pago a proveedor en efectivo",
  gasto_puntual: "Gasto puntual del negocio",
  retiro_personal: "Retiro personal del dueño",
  envio_tercero: "Envío de dinero con un tercero",
  otro: "Otro",
};

const SEPARADOR = { texto: "--------------------------------" };
const FIRMA = { texto: "Firma: ______________________", alineacion: "centro" };

function lineasComprobanteRetiro(empresa, retiro, fecha) {
  const lineas = [
    { texto: empresa.razon_social, negrita: true, alineacion: "centro" },
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
    { texto: "COMPROBANTE DE RETIRO DE EFECTIVO", negrita: true, alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
    SEPARADOR,
    { texto: `Monto: Gs ${formatoGs.format(retiro.monto)}`, negrita: true },
    { texto: montoEnLetras(Number(retiro.monto)) },
    SEPARADOR,
    { texto: `Motivo: ${ETIQUETA_MOTIVO[retiro.motivo]}` },
  ];
  if (retiro.motivo_detalle) lineas.push({ texto: retiro.motivo_detalle });
  lineas.push(
    SEPARADOR,
    { texto: `Retira/recibe: ${retiro.persona_retira}`, negrita: true },
    { texto: `Autoriza: ${retiro.autorizado_por_nombre}` },
    SEPARADOR,
    { texto: "Espacio para firma de conformidad", alineacion: "centro" },
    FIRMA
  );
  return lineas;
}

export default function ComprobanteRetiro({ empresa, retiro, onNuevoRetiro }) {
  const fecha = new Date(retiro.creado_en);
  const yaImprimio = useRef(false);

  // Se imprime solo apenas se registra el retiro, igual que el ticket de
  // venta - asi el cajero no tiene que acordarse de tocar "Imprimir" cada
  // vez, sale directo como un comprobante mas para guardar en la gabeta.
  useEffect(() => {
    if (yaImprimio.current) return;
    yaImprimio.current = true;
    imprimirTicket(empresa.impresora_agente_nombre, lineasComprobanteRetiro(empresa, retiro, fecha), () =>
      window.print()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <style>{"@page { size: 80mm auto; margin: 0; }"}</style>
      <div
        className="recibo-imprimible w-[80mm] rounded-xl bg-white p-[3mm] text-base text-slate-800 shadow"
        style={{ zoom: (empresa.ticket_escala ?? 100) / 100 }}
      >
        <p className="text-center text-2xl font-bold">{empresa.razon_social}</p>
        <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
        <p className="mt-2 text-center text-lg font-bold">COMPROBANTE DE RETIRO DE EFECTIVO</p>
        <p className="text-center text-sm text-slate-500">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="text-2xl font-bold">Gs {formatoGs.format(retiro.monto)}</p>
        <p className="text-sm text-slate-500">{montoEnLetras(Number(retiro.monto))}</p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="text-sm">
          <span className="text-slate-500">Motivo: </span>
          {ETIQUETA_MOTIVO[retiro.motivo]}
        </p>
        {retiro.motivo_detalle && <p className="text-sm text-slate-500">{retiro.motivo_detalle}</p>}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="font-semibold">Retira/recibe: {retiro.persona_retira}</p>
        <p className="text-sm text-slate-500">Autoriza: {retiro.autorizado_por_nombre}</p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />
        <p className="mt-6 text-center text-sm text-slate-400">Firma: ______________________</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            imprimirTicket(empresa.impresora_agente_nombre, lineasComprobanteRetiro(empresa, retiro, fecha), () =>
              window.print()
            )
          }
          className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
        >
          Imprimir
        </button>
      </div>

      <button onClick={onNuevoRetiro} className="text-sm font-semibold text-navy hover:text-brand">
        + Nuevo retiro
      </button>
    </div>
  );
}
