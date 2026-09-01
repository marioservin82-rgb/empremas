"use client";

import { useEffect, useRef, useState } from "react";
import { imprimirTicket } from "@/lib/agenteImpresion";
import { nombresEmpresa, lineasNombreEmpresa } from "@/lib/encabezadoEmpresa";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_FORMA_PAGO = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};

const SEPARADOR = { texto: "--------------------------------" };

function lineasReciboCobro(empresa, cliente, cobro, fecha, emisorNombre) {
  const lineas = [
    ...lineasNombreEmpresa(empresa),
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
    { texto: `Recibo de cobro N° ${cobro.numeroRecibo}`, alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
  ];
  // Sin QR grafico por este camino (impresora termica via agente, texto
  // plano) - mismo criterio ya usado para el CDC de Factura Legal: el
  // codigo de verificacion queda como texto, para poder chequearlo a mano
  // si hace falta aunque no se pueda escanear desde este ticket puntual.
  if (cobro.codigoVerificacion) {
    lineas.push({ texto: `Cod. verificación: ${cobro.codigoVerificacion}`, alineacion: "centro" });
  }
  lineas.push(SEPARADOR, { texto: `Cliente: ${cliente.nombre}`, negrita: true });
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
  lineas.push(
    SEPARADOR,
    { texto: "Gracias por su confianza.", alineacion: "centro" },
    { texto: "Contamos con usted.", alineacion: "centro" },
    SEPARADOR,
    { texto: "Comprobante interno — no es factura electrónica", alineacion: "centro" },
    SEPARADOR,
    // Espacio en blanco amplio antes del sello, a proposito, para que no
    // quede apretado ni se pise con el corte del papel (mismo criterio
    // que el ticket de credito en Recibo.js).
    { texto: "" },
    { texto: "Sello:", alineacion: "centro" },
    { texto: "*** PAGADO ***", negrita: true, alineacion: "centro" },
    SEPARADOR,
    { texto: `Emitido por: ${emisorNombre || ""}` },
    { texto: "Firma: ______________________", alineacion: "centro" }
  );
  return lineas;
}

export default function ReciboCobro({ empresa, cobro, cliente, emisorNombre, onNuevoCobro }) {
  const recuadroRef = useRef(null);
  // A diferencia del ticket de venta/retiro, este queda a eleccion del
  // cajero (nunca se imprime solo) - y ademas del ticket termico (via
  // agente ESC/POS) puede elegir Hoja A4, que siempre va por el dialogo
  // de impresion del navegador (no tiene sentido mandarla por el agente,
  // pensado solo para el rollo termico de 80mm).
  const [formato, setFormato] = useState("ticket");
  const [qr, setQr] = useState(null);

  // QR de verificacion (ver utils/verificacionRecibo.js en el backend) -
  // apunta a /verificar-recibo, publica y sin login, mismo patron ya
  // usado para el QR de la Factura Legal (import dinamico de "qrcode",
  // se genera una sola vez del lado del cliente).
  useEffect(() => {
    if (!cobro.codigoVerificacion) return;
    let cancelado = false;
    const url = `${window.location.origin}/verificar-recibo?e=${cobro.empresaId}&id=${cobro.id}&h=${cobro.codigoVerificacion}`;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(url, { margin: 1, width: 160 }).then((dataUrl) => {
        if (!cancelado) setQr(dataUrl);
      });
    });
    return () => {
      cancelado = true;
    };
  }, [cobro.empresaId, cobro.id, cobro.codigoVerificacion]);

  async function descargarImagen() {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const enlace = document.createElement("a");
    enlace.download = `recibo-${cobro.numeroRecibo}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  function imprimir() {
    if (formato === "a4") {
      window.print();
    } else {
      imprimirTicket(
        empresa.impresora_agente_nombre,
        lineasReciboCobro(empresa, cliente, cobro, fecha, emisorNombre),
        () => window.print()
      );
    }
  }

  const fecha = new Date(cobro.creadoEn);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <style>{formato === "a4" ? "@page { size: A4; margin: 15mm; }" : "@page { size: 80mm auto; margin: 0; }"}</style>

      <div className="flex justify-center gap-2 print:hidden">
        <button
          onClick={() => setFormato("ticket")}
          className={`rounded-xl px-5 py-2 font-semibold transition ${
            formato === "ticket" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          Ticket
        </button>
        <button
          onClick={() => setFormato("a4")}
          className={`rounded-xl px-5 py-2 font-semibold transition ${
            formato === "a4" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          Hoja A4
        </button>
      </div>

      {formato === "a4" ? (
        <div
          ref={recuadroRef}
          className="reporte-imprimible w-full max-w-2xl rounded-xl bg-white p-6 text-base text-slate-800 shadow"
        >
          <p className="text-center text-2xl font-bold">{nombresEmpresa(empresa).principal}</p>
          {nombresEmpresa(empresa).secundario && (
            <p className="text-center text-sm text-slate-500">{nombresEmpresa(empresa).secundario}</p>
          )}
          <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
          <p className="mt-2 text-center text-lg font-bold">Recibo de cobro N° {cobro.numeroRecibo}</p>
          <p className="text-center text-sm text-slate-500">
            {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
          </p>

          {qr && (
            <div className="my-3 flex flex-col items-center gap-1">
              <img src={qr} alt="Código QR de verificación" width={120} height={120} />
              <p className="text-xs font-semibold">Recibo N° {cobro.numeroRecibo}</p>
              <p className="text-xs text-slate-400">Escaneá para verificar</p>
            </div>
          )}

          <div className="my-4 border-t border-slate-200" />

          <p className="font-semibold">Cliente: {cliente.nombre}</p>
          {cliente.documento && <p className="text-sm">RUC/CI: {cliente.documento}</p>}
          {cliente.celular && <p className="text-sm">Cel: {cliente.celular}</p>}
          <p className="mt-2 text-3xl font-extrabold">Gs {formatoGs.format(cobro.monto)}</p>

          <div className="my-4 border-t border-slate-200" />

          <p className="mb-1 text-sm font-medium text-slate-500">Forma de pago</p>
          {cobro.pagos.map((p, indice) => (
            <p key={indice} className="text-sm">
              {ETIQUETA_FORMA_PAGO[p.formaPago]}: Gs {formatoGs.format(p.monto)}
            </p>
          ))}

          <div className="my-4 border-t border-slate-200" />

          <p className="mb-2 text-sm font-medium text-slate-500">Aplicado a</p>
          <table className="w-full text-left text-sm">
            <tbody>
              {cobro.aplicaciones.map((a, indice) => (
                <tr key={indice} className="border-b border-slate-100 last:border-0">
                  <td className="py-1">
                    {a.numeroFacturaLegal ? `Factura ${a.numeroFacturaLegal}` : `Ticket N° ${a.numeroTicket}`}
                  </td>
                  <td className="py-1 text-right font-semibold">Gs {formatoGs.format(a.montoAplicado)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="my-4 border-t border-slate-200" />

          <p className="text-center text-sm text-slate-500">Gracias por su confianza.</p>
          <p className="text-center text-sm text-slate-500">Contamos con usted.</p>
          <div className="mb-6 mt-8 flex justify-center">
            <div className="rounded border-2 border-slate-700 px-6 py-2">
              <p className="text-lg font-extrabold tracking-widest text-slate-800">✔ PAGADO</p>
            </div>
          </div>

          <div className="my-4 border-t border-slate-200" />
          <p className="text-center text-xs text-slate-400">Comprobante interno — no es factura electrónica</p>

          <div className="my-4 border-t border-slate-200" />
          <p className="text-sm">Emitido por: {emisorNombre}</p>
          <p className="mt-6 text-sm">Firma: ______________________</p>
        </div>
      ) : (
        <div
          ref={recuadroRef}
          className="recibo-imprimible w-[80mm] rounded-xl bg-white p-[3mm] text-base text-slate-800 shadow"
          style={{ zoom: (empresa.ticket_escala ?? 100) / 100 }}
        >
          <p className="text-center text-2xl font-bold">{nombresEmpresa(empresa).principal}</p>
          {nombresEmpresa(empresa).secundario && (
            <p className="text-center text-sm text-slate-500">{nombresEmpresa(empresa).secundario}</p>
          )}
          <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
          <p className="mt-2 text-center text-lg font-bold">Recibo de cobro N° {cobro.numeroRecibo}</p>
          <p className="text-center text-sm text-slate-500">
            {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
          </p>

          {qr && (
            <div className="my-2 flex flex-col items-center gap-1">
              <img src={qr} alt="Código QR de verificación" width={110} height={110} />
              <p className="text-xs font-semibold">Recibo N° {cobro.numeroRecibo}</p>
              <p className="text-xs text-slate-400">Escaneá para verificar</p>
            </div>
          )}

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

          <p className="text-center text-sm text-slate-500">Gracias por su confianza.</p>
          <p className="text-center text-sm text-slate-500">Contamos con usted.</p>
          <div className="mb-4 mt-6 flex justify-center">
            <div className="rounded border-2 border-slate-700 px-4 py-1">
              <p className="text-base font-extrabold tracking-widest text-slate-800">✔ PAGADO</p>
            </div>
          </div>

          <div className="my-2 border-t-2 border-dashed border-slate-300" />
          <p className="mt-2 text-center text-xs text-slate-400">Comprobante interno — no es factura electrónica</p>

          <div className="my-2 border-t-2 border-dashed border-slate-300" />
          <p className="text-sm">Emitido por: {emisorNombre}</p>
          <p className="mt-4 text-sm">Firma: ______________________</p>
        </div>
      )}

      <div className="flex gap-2 print:hidden">
        <button onClick={imprimir} className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light">
          Imprimir
        </button>
        <button
          onClick={descargarImagen}
          className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
        >
          Descargar imagen
        </button>
      </div>

      <button onClick={onNuevoCobro} className="text-sm font-semibold text-navy hover:text-brand print:hidden">
        + Nuevo cobro
      </button>
    </div>
  );
}
