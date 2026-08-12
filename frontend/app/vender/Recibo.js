"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { imprimirTicket } from "@/lib/agenteImpresion";

const formatoGs = new Intl.NumberFormat("es-PY");

const FORMAS_PAGO_ETIQUETA = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};

const ETIQUETA_TIPO_PAGO = {
  contado: "Contado",
  credito: "Crédito",
  mayorista: "Mayorista",
};

// Consulta el estado del documento electronico de una venta cada 5s
// (recomendacion de Sifende) hasta que quede aprobado/rechazado, o hasta
// 1 minuto sin resolverse.
function EstadoFacturaLegal({ ventaId, onNuevaVenta, empresa, cliente, items, autoImprimir }) {
  const [venta, setVenta] = useState(null);
  const [error, setError] = useState("");
  const [reintentando, setReintentando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  // El KuDE real de Sifende es un solo PDF (pensado para A4). Para poder
  // imprimir tambien en el rollo termico de 80mm, se arma una version
  // propia en base a los mismos datos (numero de factura/CDC incluidos) -
  // el documento oficial ante SIFEN sigue siendo el PDF, esto es solo una
  // copia de mostrador con el mismo numero.
  const [formatoTicket, setFormatoTicket] = useState("a4");

  // El backend exige el token por header (no hay sesion por cookie), asi
  // que no puede ser un <a href> directo - se pide el PDF ya autenticado.
  async function pedirKude() {
    const token = localStorage.getItem("empremas_token");
    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/ventas/${ventaId}/kude`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error("No se pudo descargar la factura");
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }

  async function descargarKude() {
    setDescargando(true);
    setError("");
    try {
      const url = await pedirKude();
      window.open(url, "_blank");
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  // Abre el dialogo de impresion (con selector de impresora) directo
  // sobre el PDF, sin que el cajero tenga que ir a buscarlo a Descargas y
  // abrirlo aparte. Se arma con un iframe oculto en vez de una pestana
  // nueva porque es la forma mas confiable de que el navegador dispare
  // el print() ya con el PDF cargado (una pestana nueva puede tardar en
  // renderizar el visor de PDF antes de que print() sirva de algo).
  async function imprimirKude() {
    setImprimiendo(true);
    setError("");
    try {
      const url = await pedirKude();
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      };
      document.body.appendChild(iframe);
    } catch (err) {
      setError(err.message);
    } finally {
      setImprimiendo(false);
    }
  }

  useEffect(() => {
    let cancelado = false;
    let intentos = 0;

    async function consultar() {
      try {
        const datos = await apiFetch(`/api/ventas/${ventaId}`);
        if (cancelado) return;
        setVenta(datos);
        intentos += 1;
        const enCurso = !datos.de_estado || ["pendiente", "en_lote", "enviado"].includes(datos.de_estado);
        if (enCurso && intentos < 12) {
          setTimeout(consultar, 5000);
        }
      } catch (err) {
        if (!cancelado) setError(err.message);
      }
    }
    consultar();
    return () => {
      cancelado = true;
    };
  }, [ventaId]);

  async function reintentar() {
    setReintentando(true);
    setError("");
    try {
      await apiFetch(`/api/ventas/${ventaId}/reintentar-sifen`, { method: "POST" });
      const datos = await apiFetch(`/api/ventas/${ventaId}`);
      setVenta(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setReintentando(false);
    }
  }

  if (error) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }
  if (!venta) {
    return <p className="text-slate-500">Consultando SIFEN...</p>;
  }

  const estado = venta.de_estado;
  const aprobada = estado === "aprobado";
  // Sifende asigna el CDC/numero apenas ACEPTA el envio, mucho antes de la
  // confirmacion final de aprobado - no tiene sentido hacer esperar al
  // cajero esa confirmacion solo para poder entregarle un comprobante.
  // El KuDE (PDF oficial) si depende de "aprobado" (Sifende todavia no lo
  // genera antes de eso), pero el Ticket propio no - se puede imprimir en
  // cuanto haya CDC.
  const tieneCdc = !!venta.de_cdc && estado !== "rechazado";

  if (tieneCdc) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        {!aprobada && (
          <p className="text-center text-xs font-semibold text-amber-600">
            ⏳ SIFEN todavía está confirmando la aprobación final — ya podés imprimir mientras tanto.
          </p>
        )}
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setFormatoTicket("ticket")}
            className={`rounded-xl px-5 py-2 font-semibold transition ${
              formatoTicket === "ticket" ? "bg-blue-700 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Ticket
          </button>
          <button
            onClick={() => setFormatoTicket("a4")}
            className={`rounded-xl px-5 py-2 font-semibold transition ${
              formatoTicket === "a4" ? "bg-blue-700 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Hoja A4
          </button>
        </div>

        {formatoTicket === "a4" ? (
          <div className="w-full rounded-2xl bg-white p-6 text-center shadow shadow-slate-200">
            <p className="text-sm text-slate-400">Factura Legal</p>
            <p className="mt-1 text-3xl font-extrabold text-blue-900">Gs {formatoGs.format(venta.total)}</p>
            <p className={`mt-3 text-sm font-semibold ${aprobada ? "text-emerald-600" : "text-amber-600"}`}>
              {aprobada ? "✅ Aprobada por SIFEN" : "⏳ Pendiente de confirmación final"}
            </p>
            {venta.de_numero_formateado && (
              <p className="mt-1 text-sm text-slate-500">N° {venta.de_numero_formateado}</p>
            )}
            {aprobada ? (
              <>
                <p className="mt-3 text-xs text-slate-400">
                  Esta hoja es el PDF oficial (KuDE) que genera SIFEN — se imprime tal cual, sin descargarlo antes.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={imprimirKude}
                    disabled={imprimiendo}
                    className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    {imprimiendo ? "Abriendo..." : "Imprimir factura"}
                  </button>
                  <button
                    onClick={descargarKude}
                    disabled={descargando}
                    className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                  >
                    {descargando ? "Descargando..." : "Descargar factura (PDF)"}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs text-slate-400">
                El PDF oficial (KuDE) todavía no está listo — Sifende lo genera recién con la aprobación final.
                Mientras tanto, imprimí el Ticket.
              </p>
            )}
          </div>
        ) : (
          <TicketFacturaLegal
            empresa={empresa}
            venta={venta}
            cliente={cliente}
            items={items}
            autoImprimir={autoImprimir}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <div className="w-full rounded-2xl bg-white p-6 text-center shadow shadow-slate-200">
        <p className="text-sm text-slate-400">Factura Legal</p>
        <p className="mt-1 text-3xl font-extrabold text-blue-900">Gs {formatoGs.format(venta.total)}</p>

        {(estado === "pendiente" || estado === "en_lote" || estado === "enviado" || !estado) && (
          <p className="mt-3 text-sm font-semibold text-amber-600">Enviando a SIFEN...</p>
        )}
        {estado === "error" && (
          <>
            <p className="mt-3 text-sm font-semibold text-red-600">No se pudo enviar a SIFEN</p>
            <p className="mt-1 text-xs text-slate-500">{venta.de_mensaje_error}</p>
            <button
              onClick={reintentar}
              disabled={reintentando}
              className="mt-3 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {reintentando ? "Reintentando..." : "Reintentar envío"}
            </button>
          </>
        )}
        {estado === "rechazado" && (
          <>
            <p className="mt-3 text-sm font-semibold text-red-600">Rechazada por SIFEN</p>
            <p className="mt-1 text-xs text-slate-500">{venta.de_mensaje_error}</p>
          </>
        )}
      </div>
      <button onClick={onNuevaVenta} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
        + Nueva venta
      </button>
    </div>
  );
}

const SEPARADOR = { texto: "--------------------------------" };
const FIRMA = { texto: "Firma: ______________________", alineacion: "centro" };

// Version en texto plano del ticket de Factura Legal, para el agente de
// impresion (ver frontend/lib/agenteImpresion.js) - mismas lineas que el
// JSX de abajo, pero como array {texto, negrita, alineacion} en vez de
// HTML. El QR queda afuera (no todas las impresoras entienden el comando
// ESC/POS de QR nativo) - se imprime el CDC como texto, igual que ya se
// ve debajo del QR en la version HTML.
function lineasTicketFacturaLegal(empresa, cliente, venta, items) {
  const fecha = new Date(venta.creado_en);
  const lineas = [
    { texto: empresa?.razon_social, negrita: true, alineacion: "centro" },
    { texto: `RUC ${empresa?.ruc}`, alineacion: "centro" },
  ];
  if (empresa?.direccion) lineas.push({ texto: empresa.direccion, alineacion: "centro" });
  if (empresa?.telefono) lineas.push({ texto: `Tel: ${empresa.telefono}`, alineacion: "centro" });
  lineas.push(
    { texto: "FACTURA ELECTRÓNICA", alineacion: "centro" },
    { texto: `N° ${venta.de_numero_formateado}`, alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
    SEPARADOR,
    { texto: `Cliente: ${cliente?.nombre}`, negrita: true }
  );
  if (cliente?.documento) lineas.push({ texto: `RUC/CI: ${cliente.documento}` });
  if (cliente?.direccion) lineas.push({ texto: `Dirección: ${cliente.direccion}` });
  lineas.push(SEPARADOR);
  for (const i of items ?? []) {
    lineas.push(
      { texto: `${i.cantidad} x ${i.nombre}` },
      { texto: `Gs ${formatoGs.format(i.precioUnitario)} c/u   Gs ${formatoGs.format(i.precioUnitario * i.cantidad)}` }
    );
  }
  lineas.push(
    SEPARADOR,
    { texto: `Total: Gs ${formatoGs.format(venta.total)}`, negrita: true },
    SEPARADOR,
    { texto: `CDC: ${venta.de_cdc}` },
    { texto: "Factura Electrónica — documento tributario legal", alineacion: "centro" },
    SEPARADOR,
    FIRMA
  );
  return lineas;
}

// Version en texto plano del ticket comun (ticket_comun) - mismo criterio
// que lineasTicketFacturaLegal, calcado del JSX del componente Recibo de
// mas abajo.
function lineasTicketComun(empresa, cliente, venta, items, entregaInicial) {
  const fecha = new Date(venta.creadoEn);
  const lineas = [
    { texto: empresa.razon_social, negrita: true, alineacion: "centro" },
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
  ];
  if (empresa.direccion) lineas.push({ texto: empresa.direccion, alineacion: "centro" });
  if (empresa.telefono) lineas.push({ texto: `Tel: ${empresa.telefono}`, alineacion: "centro" });
  lineas.push({
    texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`,
    alineacion: "centro",
  });
  if (venta.numeroTicket != null) lineas.push({ texto: `N° ${venta.numeroTicket}`, alineacion: "centro" });
  lineas.push(SEPARADOR, { texto: `Cliente: ${cliente.nombre}`, negrita: true });
  if (cliente.documento) lineas.push({ texto: `RUC/CI: ${cliente.documento}` });
  if (cliente.celular) lineas.push({ texto: `Cel: ${cliente.celular}` });
  if (cliente.direccion) lineas.push({ texto: `Dirección: ${cliente.direccion}` });
  lineas.push({ texto: `Condición: ${ETIQUETA_TIPO_PAGO[venta.tipoPago]}` });
  if (venta.tipoPago === "credito" && empresa.plazo_credito_dias) {
    lineas.push({ texto: `Plazo: ${empresa.plazo_credito_dias} días` });
  }
  lineas.push(SEPARADOR);
  for (const i of items) {
    lineas.push(
      { texto: `${i.cantidad} x ${i.nombre}` },
      { texto: `Gs ${formatoGs.format(i.precioUnitario)} c/u   Gs ${formatoGs.format(i.precioUnitario * i.cantidad)}` }
    );
  }
  lineas.push(SEPARADOR, { texto: `Total: Gs ${formatoGs.format(venta.total)}`, negrita: true });
  for (const p of venta.pagos ?? []) {
    lineas.push({ texto: `${FORMAS_PAGO_ETIQUETA[p.formaPago]}: Gs ${formatoGs.format(p.monto)}` });
  }
  if (venta.vuelto > 0) lineas.push({ texto: `Vuelto: Gs ${formatoGs.format(venta.vuelto)}` });
  if (venta.tipoPago === "credito") {
    lineas.push(
      { texto: venta.saldoPendiente > 0 ? "FIADO — queda a cuenta del cliente" : "Cubierto en el momento", negrita: true },
      SEPARADOR
    );
    if (entregaInicial > 0) lineas.push({ texto: `Entrega inicial: Gs ${formatoGs.format(entregaInicial)}` });
    lineas.push({ texto: `Saldo financiado (esta compra): Gs ${formatoGs.format(venta.saldoPendiente)}` });
    if (venta.vencimiento) {
      lineas.push({
        texto: `Vencimiento: ${new Date(`${venta.vencimiento.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY")}`,
      });
    }
    if (venta.clienteSaldo != null) {
      lineas.push(
        SEPARADOR,
        { texto: `Saldo total adeudado: Gs ${formatoGs.format(venta.clienteSaldo)}` },
        { texto: `Crédito disponible: Gs ${formatoGs.format(venta.clienteSaldoDisponible)}` }
      );
    }
  }
  lineas.push(
    SEPARADOR,
    { texto: "Comprobante interno — no es factura electrónica", alineacion: "centro" },
    SEPARADOR,
    FIRMA
  );
  return lineas;
}

// Copia de mostrador en 80mm de una Factura Legal ya aprobada - el
// documento oficial ante SIFEN sigue siendo el KuDE (PDF), esto es una
// version propia con los mismos datos (numero de factura y CDC
// incluidos) para poder entregarle algo al cliente en el rollo termico.
// El QR de acá NO es el mismo que trae el KuDE real (ese incluye un hash
// de seguridad que Sifende no nos devuelve) - apunta a la consulta
// pública del CDC en e-Kuatia, sirve para verificar que el documento
// existe, pero no reemplaza al QR oficial del PDF.
function TicketFacturaLegal({ empresa, venta, cliente, items, autoImprimir }) {
  const fecha = new Date(venta.creado_en);
  const [qr, setQr] = useState(null);
  const yaImprimio = useRef(false);

  useEffect(() => {
    if (!venta.de_cdc) return;
    let cancelado = false;
    import("qrcode").then((QRCode) => {
      const url = `https://ekuatia.set.gov.py/consultas/qr?nVersion=150&Id=${venta.de_cdc}`;
      QRCode.toDataURL(url, { margin: 1, width: 160 }).then((dataUrl) => {
        if (!cancelado) setQr(dataUrl);
      });
    });
    return () => {
      cancelado = true;
    };
  }, [venta.de_cdc]);

  // Se imprime sola apenas se puede (no hace falta esperar el QR: sale
  // igual de bien sin el si se imprime justo antes de que termine de
  // generarse) - una sola vez por venta, para que un cambio de estado por
  // el polling de mas arriba no dispare un segundo dialogo de impresion.
  // Solo cuando autoImprimir viene en true (recien cerrada la venta en
  // Vender) - al reabrir una venta vieja desde /ventas/:id no debe
  // imprimir sola cada vez que alguien la mira.
  useEffect(() => {
    if (!autoImprimir || yaImprimio.current) return;
    yaImprimio.current = true;
    imprimirTicket(empresa?.impresora_agente_nombre, lineasTicketFacturaLegal(empresa, cliente, venta, items), () =>
      window.print()
    );
  }, [autoImprimir]);

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{"@page { size: 80mm auto; margin: 0; }"}</style>
      <div
        className="recibo-imprimible w-[80mm] rounded-xl bg-white p-[3mm] font-bold text-base text-slate-800 shadow"
        style={{ zoom: (empresa?.ticket_escala ?? 100) / 100 }}
      >
        <p className="text-center text-xl">{empresa?.razon_social}</p>
        <p className="text-center text-sm">RUC {empresa?.ruc}</p>
        {empresa?.direccion && <p className="text-center text-sm">{empresa.direccion}</p>}
        {empresa?.telefono && <p className="text-center text-sm">Tel: {empresa.telefono}</p>}
        <p className="mt-2 text-center text-base">FACTURA ELECTRÓNICA</p>
        <p className="text-center text-sm">N° {venta.de_numero_formateado}</p>
        <p className="text-center text-sm">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="mb-1 text-sm">Cliente: {cliente?.nombre}</p>
        {cliente?.documento && <p className="text-sm">RUC/CI: {cliente.documento}</p>}
        {cliente?.direccion && <p className="text-sm">Dirección: {cliente.direccion}</p>}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        {items?.map((i) => (
          <div key={i.productoId} className="mb-2">
            <p>
              {i.cantidad} x {i.nombre}
            </p>
            <div className="flex justify-between text-sm">
              <span>Gs {formatoGs.format(i.precioUnitario)} c/u</span>
              <span>Gs {formatoGs.format(i.precioUnitario * i.cantidad)}</span>
            </div>
          </div>
        ))}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <div className="flex justify-between text-2xl">
          <span>Total</span>
          <span>Gs {formatoGs.format(venta.total)}</span>
        </div>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        {qr && (
          <div className="flex justify-center py-1">
            <img src={qr} alt="Código QR de verificación" width={120} height={120} />
          </div>
        )}
        <p className="break-all text-center text-xs">CDC: {venta.de_cdc}</p>
        <p className="mt-1 text-center text-xs">Factura Electrónica — documento tributario legal</p>
      </div>

      <button
        onClick={() =>
          imprimirTicket(empresa?.impresora_agente_nombre, lineasTicketFacturaLegal(empresa, cliente, venta, items), () =>
            window.print()
          )
        }
        className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
      >
        Imprimir
      </button>
    </div>
  );
}

export default function Recibo({
  empresa,
  venta,
  cliente,
  items,
  formato = "ticket_comun",
  onNuevaVenta,
  textoVolver = "+ Nueva venta",
  accionesExtra,
  autoImprimir = false,
}) {
  const recuadroRef = useRef(null);
  const yaImprimio = useRef(false);

  async function descargarImagen() {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const enlace = document.createElement("a");
    enlace.download = `venta-${venta.id.slice(0, 8)}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  const fecha = new Date(venta.creadoEn);
  // Se recalcula de los pagos en vez de leer venta.entregaInicial directo,
  // asi funciona igual en el ticket recien cobrado y en una reimpresión
  // (que no trae ese campo puntual, pero sí los pagos guardados).
  const entregaInicial = venta.pagos?.reduce((acumulado, p) => acumulado + Number(p.monto), 0) ?? 0;

  if (formato === "factura_legal") {
    return (
      <EstadoFacturaLegal
        ventaId={venta.id}
        onNuevaVenta={onNuevaVenta}
        empresa={empresa}
        cliente={cliente}
        items={items}
        autoImprimir={autoImprimir}
      />
    );
  }

  if (formato === "sin_comprobante") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow shadow-slate-200">
          <p className="text-sm text-slate-400">Venta registrada sin comprobante</p>
          <p className="mt-2 text-3xl font-extrabold text-blue-900">Gs {formatoGs.format(venta.total)}</p>
        </div>
        <button onClick={onNuevaVenta} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          + Nueva venta
        </button>
      </div>
    );
  }

  const esA4 = formato === "a4";

  // Al cerrar la venta en Vender (autoImprimir=true) imprime sola, sin
  // que el cajero tenga que tocar el botón - una sola vez por venta, para
  // que reabrir esta misma pantalla despues (reimpresión, /ventas/:id)
  // nunca dispare un dialogo de impresion sin que lo pidan.
  useEffect(() => {
    if (!autoImprimir || yaImprimio.current) return;
    yaImprimio.current = true;
    if (esA4) {
      window.print();
    } else {
      imprimirTicket(
        empresa.impresora_agente_nombre,
        lineasTicketComun(empresa, cliente, venta, items, entregaInicial),
        () => window.print()
      );
    }
  }, [autoImprimir]);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
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
        {empresa.direccion && <p className="text-center text-sm text-slate-500">{empresa.direccion}</p>}
        {empresa.telefono && <p className="text-center text-sm text-slate-500">Tel: {empresa.telefono}</p>}
        <p className="mt-2 text-center text-sm text-slate-500">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>
        {venta.numeroTicket != null && (
          <p className="text-center text-sm text-slate-500">N° {venta.numeroTicket}</p>
        )}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="mb-1 font-semibold">Cliente: {cliente.nombre}</p>
        {cliente.documento && <p className="text-sm">RUC/CI: {cliente.documento}</p>}
        {cliente.celular && <p className="text-sm">Cel: {cliente.celular}</p>}
        {cliente.direccion && <p className="text-sm">Dirección: {cliente.direccion}</p>}
        <p className="text-sm font-semibold">Condición: {ETIQUETA_TIPO_PAGO[venta.tipoPago]}</p>
        {venta.tipoPago === "credito" && empresa.plazo_credito_dias && (
          <p className="text-sm">Plazo: {empresa.plazo_credito_dias} días</p>
        )}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        {items.map((i) => (
          <div key={i.productoId} className="mb-2">
            <p>
              {i.cantidad} x {i.nombre}
            </p>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Gs {formatoGs.format(i.precioUnitario)} c/u</span>
              <span className="font-semibold text-slate-800">
                Gs {formatoGs.format(i.precioUnitario * i.cantidad)}
              </span>
            </div>
          </div>
        ))}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <div className="flex justify-between text-2xl font-bold">
          <span>Total</span>
          <span>Gs {formatoGs.format(venta.total)}</span>
        </div>

        {venta.pagos?.map((p, indice) => (
          <p key={indice} className="mt-2 text-sm">
            {FORMAS_PAGO_ETIQUETA[p.formaPago]}: Gs {formatoGs.format(p.monto)}
          </p>
        ))}
        {venta.vuelto > 0 && <p className="text-sm">Vuelto: Gs {formatoGs.format(venta.vuelto)}</p>}
        {venta.tipoPago === "credito" && (
          <>
            <p className="text-sm font-bold">
              {venta.saldoPendiente > 0 ? "FIADO — queda a cuenta del cliente" : "Cubierto en el momento"}
            </p>
            <div className="my-2 border-t-2 border-dashed border-slate-300" />
            {entregaInicial > 0 && (
              <p className="text-sm">Entrega inicial: Gs {formatoGs.format(entregaInicial)}</p>
            )}
            <p className="text-sm">Saldo financiado (esta compra): Gs {formatoGs.format(venta.saldoPendiente)}</p>
            {venta.vencimiento && (
              <p className="text-sm">
                {/* venta.vencimiento puede venir como "YYYY-MM-DD" (venta
                    recien creada) o como ISO completo con hora (reimpresión,
                    vuelve asi de JSON) - se toma solo la fecha y se fuerza
                    hora local para no correrse un dia en husos negativos. */}
                Vencimiento: {new Date(`${venta.vencimiento.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY")}
              </p>
            )}
            {venta.clienteSaldo != null && (
              <>
                <div className="my-2 border-t-2 border-dashed border-slate-300" />
                <p className="text-sm">Saldo total adeudado: Gs {formatoGs.format(venta.clienteSaldo)}</p>
                <p className="text-sm">Crédito disponible: Gs {formatoGs.format(venta.clienteSaldoDisponible)}</p>
              </>
            )}
          </>
        )}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="mt-2 text-center text-xs text-slate-400">Comprobante interno — no es factura electrónica</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            esA4
              ? window.print()
              : imprimirTicket(
                  empresa.impresora_agente_nombre,
                  lineasTicketComun(empresa, cliente, venta, items, entregaInicial),
                  () => window.print()
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

      {onNuevaVenta && (
        <button onClick={onNuevaVenta} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          {textoVolver}
        </button>
      )}
    </div>
  );
}
