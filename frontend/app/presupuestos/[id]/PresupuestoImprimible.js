"use client";

import { useRef, useState } from "react";
import { imprimirTicket } from "@/lib/agenteImpresion";

const formatoGs = new Intl.NumberFormat("es-PY");
// Ver mismo comentario en Recibo.js: sin esto, una cantidad entera sale
// como "1.000" (se lee "mil" en formato paraguayo, no "uno").
const formatoCantidad = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const SEPARADOR = { texto: "--------------------------------" };
const FIRMA = { texto: "Firma: ______________________", alineacion: "centro" };

function lineasPresupuesto(empresa, presupuesto, fecha) {
  const lineas = [
    { texto: empresa.razon_social, negrita: true, alineacion: "centro" },
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
    { texto: "PRESUPUESTO", alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
    SEPARADOR,
  ];
  if (presupuesto.cliente_nombre) lineas.push({ texto: `Cliente: ${presupuesto.cliente_nombre}`, negrita: true });
  if (presupuesto.cliente_documento) lineas.push({ texto: `RUC/CI: ${presupuesto.cliente_documento}` });
  if (presupuesto.cliente_celular) lineas.push({ texto: `Cel: ${presupuesto.cliente_celular}` });
  lineas.push(SEPARADOR);
  for (const i of presupuesto.items) {
    lineas.push(
      { texto: `${formatoCantidad.format(Number(i.cantidad))} ${i.unidad_medida ?? ""} x ${i.producto_nombre}`.replace(/\s+/g, " ") },
      { texto: `Gs ${formatoGs.format(i.precio_unitario)} c/u   Gs ${formatoGs.format(i.subtotal)}` }
    );
  }
  lineas.push(
    SEPARADOR,
    { texto: `Total: Gs ${formatoGs.format(presupuesto.total)}`, negrita: true },
    SEPARADOR,
    {
      texto: `Presupuesto válido hasta el ${new Date(presupuesto.vencimiento).toLocaleDateString("es-PY")}`,
      alineacion: "centro",
    },
    { texto: "Precios sujetos a stock disponible", alineacion: "centro" },
    SEPARADOR,
    FIRMA
  );
  return lineas;
}

export default function PresupuestoImprimible({ empresa, presupuesto, accionesExtra }) {
  const recuadroRef = useRef(null);
  const [formato, setFormato] = useState("ticket_comun");

  async function descargarImagen() {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const enlace = document.createElement("a");
    enlace.download = `presupuesto-${presupuesto.id.slice(0, 8)}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  const esA4 = formato === "a4";
  const fecha = new Date(presupuesto.creado_en);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex justify-center gap-2">
        <button
          onClick={() => setFormato("ticket_comun")}
          className={`rounded-xl px-5 py-2 font-semibold transition ${
            formato === "ticket_comun" ? "bg-blue-700 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          Ticket
        </button>
        <button
          onClick={() => setFormato("a4")}
          className={`rounded-xl px-5 py-2 font-semibold transition ${
            esA4 ? "bg-blue-700 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          Hoja A4
        </button>
      </div>

      <style>{esA4 ? "@page { size: A4; margin: 15mm; }" : "@page { size: 80mm auto; margin: 0; }"}</style>
      <div
        ref={recuadroRef}
        className={
          esA4
            ? "reporte-imprimible w-full max-w-2xl rounded-xl bg-white p-6 text-base text-slate-800 shadow"
            : "recibo-imprimible w-[80mm] rounded-xl bg-white p-[3mm] text-base text-slate-800 shadow"
        }
        style={esA4 ? undefined : { zoom: (empresa.ticket_escala ?? 100) / 100 }}
      >
        <p className="text-center text-2xl font-bold">{empresa.razon_social}</p>
        <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
        <p className="mt-2 text-center text-lg font-bold">PRESUPUESTO</p>
        <p className="text-center text-sm text-slate-500">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        {presupuesto.cliente_nombre && <p className="mb-1 font-semibold">Cliente: {presupuesto.cliente_nombre}</p>}
        {presupuesto.cliente_documento && <p className="text-sm">RUC/CI: {presupuesto.cliente_documento}</p>}
        {presupuesto.cliente_celular && <p className="text-sm">Cel: {presupuesto.cliente_celular}</p>}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        {presupuesto.items.map((i) => (
          <div key={i.id} className="mb-2">
            <p>
              {formatoCantidad.format(Number(i.cantidad))} {i.unidad_medida} x {i.producto_nombre}
            </p>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Gs {formatoGs.format(i.precio_unitario)} c/u</span>
              <span className="font-semibold text-slate-800">Gs {formatoGs.format(i.subtotal)}</span>
            </div>
          </div>
        ))}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <div className="flex justify-between text-2xl font-bold">
          <span>Total</span>
          <span>Gs {formatoGs.format(presupuesto.total)}</span>
        </div>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="text-center text-xs text-slate-400">
          Presupuesto válido hasta el {new Date(presupuesto.vencimiento).toLocaleDateString("es-PY")}
        </p>
        <p className="mt-1 text-center text-xs text-slate-400">Precios sujetos a stock disponible</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() =>
            esA4
              ? window.print()
              : imprimirTicket(empresa.impresora_agente_nombre, lineasPresupuesto(empresa, presupuesto, fecha), () =>
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
        {accionesExtra}
      </div>
    </div>
  );
}
