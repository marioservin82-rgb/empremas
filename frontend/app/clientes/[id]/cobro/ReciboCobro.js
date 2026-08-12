"use client";

import { useRef } from "react";
import { imprimirTicket } from "@/lib/agenteImpresion";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_FORMA_PAGO = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};

const SEPARADOR = { texto: "--------------------------------" };

function lineasReciboCobro(empresa, cliente, cobro, fecha) {
  const lineas = [
    { texto: empresa.razon_social, negrita: true, alineacion: "centro" },
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
    { texto: `Recibo de cobro N° ${cobro.numeroRecibo}`, negrita: true, alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
    SEPARADOR,
    { texto: `Cliente: ${cliente.nombre}`, negrita: true },
  ];
  if (cliente.documento) lineas.push({ texto: `RUC/CI: ${cliente.documento}` });
  if (cliente.celular) lineas.push({ texto: `Cel: ${cliente.celular}` });
  lineas.push({ texto: `Total: Gs ${formatoGs.format(cobro.monto)}`, negrita: true }, SEPARADOR);
  for (const p of cobro.pagos) {
    lineas.push({ texto: `${ETIQUETA_FORMA_PAGO[p.formaPago]}: Gs ${formatoGs.format(p.monto)}` });
  }
  lineas.push(SEPARADOR, { texto: "Aplicado a:" });
  for (const a of cobro.aplicaciones) {
    lineas.push({
      texto: `${a.numeroFacturaLegal ? `Factura ${a.numeroFacturaLegal}` : `Ticket N° ${a.numeroTicket}`}   Gs ${formatoGs.format(a.montoAplicado)}`,
    });
  }
  lineas.push(SEPARADOR, { texto: "Comprobante interno — no es factura electrónica", alineacion: "centro" });
  return lineas;
}

export default function ReciboCobro({ empresa, cobro, cliente, onNuevoCobro }) {
  const recuadroRef = useRef(null);

  async function descargarImagen() {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const enlace = document.createElement("a");
    enlace.download = `recibo-${cobro.numeroRecibo}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  const fecha = new Date(cobro.creadoEn);

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
        <p className="mt-2 text-center text-lg font-bold">Recibo de cobro N° {cobro.numeroRecibo}</p>
        <p className="text-center text-sm text-slate-500">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="font-semibold">Cliente: {cliente.nombre}</p>
        {cliente.documento && <p className="text-sm">RUC/CI: {cliente.documento}</p>}
        {cliente.celular && <p className="text-sm">Cel: {cliente.celular}</p>}
        <p className="mt-2 text-2xl font-bold">Gs {formatoGs.format(cobro.monto)}</p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        {cobro.pagos.map((p, indice) => (
          <p key={indice} className="text-sm">
            {ETIQUETA_FORMA_PAGO[p.formaPago]}: Gs {formatoGs.format(p.monto)}
          </p>
        ))}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="mb-2 text-sm font-medium text-slate-500">Aplicado a:</p>
        {cobro.aplicaciones.map((a, indice) => (
          <div key={indice} className="mb-1 flex justify-between text-sm">
            <span>{a.numeroFacturaLegal ? `Factura ${a.numeroFacturaLegal}` : `Ticket N° ${a.numeroTicket}`}</span>
            <span>Gs {formatoGs.format(a.montoAplicado)}</span>
          </div>
        ))}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />
        <p className="mt-2 text-center text-xs text-slate-400">Comprobante interno — no es factura electrónica</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            imprimirTicket(empresa.impresora_agente_nombre, lineasReciboCobro(empresa, cliente, cobro, fecha), () =>
              window.print()
            )
          }
          className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
        >
          Imprimir
        </button>
        <button
          onClick={descargarImagen}
          className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          Descargar imagen
        </button>
      </div>

      <button onClick={onNuevoCobro} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
        + Nuevo cobro
      </button>
    </div>
  );
}
