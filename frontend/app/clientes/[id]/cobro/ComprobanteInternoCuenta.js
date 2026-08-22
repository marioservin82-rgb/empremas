"use client";

import { imprimirTicket } from "@/lib/agenteImpresion";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_FORMA_PAGO = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};

const SEPARADOR = { texto: "--------------------------------" };

// A diferencia del Recibo de Cobro (el documento que se lleva el cliente),
// este muestra saldo anterior/pagado/restante - a proposito, es para
// control interno del negocio (cuadrar caja/cuenta corriente), no para
// entregar. Por eso mismo queda sin sello ni firma, solo ticket (sin
// version A4) y siempre manual, nunca se imprime solo.
function lineasComprobanteInternoCuenta(empresa, cliente, cobro, fecha) {
  const lineas = [
    { texto: empresa.razon_social, negrita: true, alineacion: "centro" },
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
    { texto: "COMPROBANTE INTERNO DE CUENTA", negrita: true, alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
    SEPARADOR,
    { texto: `Cliente: ${cliente.nombre}`, negrita: true },
  ];
  if (cliente.documento) lineas.push({ texto: `RUC/CI: ${cliente.documento}` });
  lineas.push(
    SEPARADOR,
    { texto: `Saldo anterior: Gs ${formatoGs.format(cobro.saldoAnterior)}` },
    { texto: `Monto pagado: Gs ${formatoGs.format(cobro.monto)}`, negrita: true },
    { texto: `Saldo restante: Gs ${formatoGs.format(cobro.saldoRestante)}` },
    SEPARADOR
  );
  for (const p of cobro.pagos) {
    lineas.push({ texto: `${ETIQUETA_FORMA_PAGO[p.formaPago]}: Gs ${formatoGs.format(p.monto)}` });
  }
  lineas.push(SEPARADOR, { texto: "Aplicado a:" });
  for (const a of cobro.aplicaciones) {
    lineas.push({
      texto: `${a.numeroFacturaLegal ? `Factura ${a.numeroFacturaLegal}` : `Ticket N° ${a.numeroTicket}`}   Gs ${formatoGs.format(a.montoAplicado)}`,
    });
  }
  lineas.push(SEPARADOR, { texto: "Uso interno — no es el recibo entregado al cliente", alineacion: "centro" });
  return lineas;
}

export default function ComprobanteInternoCuenta({ empresa, cobro, cliente }) {
  const fecha = new Date(cobro.creadoEn);

  function imprimir() {
    imprimirTicket(empresa.impresora_agente_nombre, lineasComprobanteInternoCuenta(empresa, cliente, cobro, fecha), () =>
      window.print()
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <style>{"@page { size: 80mm auto; margin: 0; }"}</style>

      <div
        className="recibo-imprimible w-[80mm] rounded-xl bg-white p-[3mm] text-base text-slate-800 shadow"
        style={{ zoom: (empresa.ticket_escala ?? 100) / 100 }}
      >
        <p className="text-center text-2xl font-bold">{empresa.razon_social}</p>
        <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
        <p className="mt-2 text-center text-lg font-bold">COMPROBANTE INTERNO DE CUENTA</p>
        <p className="text-center text-sm text-slate-500">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="font-semibold">Cliente: {cliente.nombre}</p>
        {cliente.documento && <p className="text-sm">RUC/CI: {cliente.documento}</p>}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Saldo anterior</span>
          <span className="font-semibold">Gs {formatoGs.format(cobro.saldoAnterior)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Monto pagado</span>
          <span>Gs {formatoGs.format(cobro.monto)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Saldo restante</span>
          <span className="font-semibold">Gs {formatoGs.format(cobro.saldoRestante)}</span>
        </div>

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
        <p className="mt-2 text-center text-xs text-slate-400">Uso interno — no es el recibo entregado al cliente</p>
      </div>

      <button onClick={imprimir} className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light print:hidden">
        Imprimir
      </button>
    </div>
  );
}
