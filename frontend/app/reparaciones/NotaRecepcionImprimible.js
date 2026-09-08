"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { imprimirTicket } from "@/lib/agenteImpresion";
import { nombresEmpresa, lineasNombreEmpresa } from "@/lib/encabezadoEmpresa";
import { obtenerNumeroSoportePlataforma } from "@/lib/soportePlataforma";
import { lineasPiePublicidadEmpremas } from "@/lib/piePublicidadEmpremas";
import PiePublicidadEmpremas from "@/components/PiePublicidadEmpremas";
import { logoParaTicket } from "@/lib/logoEmpresa";
import { TEXTO_LEGAL_POR_DEFECTO } from "@/lib/reparaciones";

const SEPARADOR = { texto: "--------------------------------" };

// El agente de impresion ya envuelve solo un renglon largo (envolverTexto),
// pero NO interpreta un "\n" embebido como corte de linea - por eso un
// texto libre (estado del equipo, comentario, texto legal) se separa a
// mano por parrafo antes de mandarlo.
function lineasDeTexto(texto) {
  return String(texto || "")
    .split("\n")
    .map((t) => ({ texto: t }));
}

function lineasNotaRecepcion(empresa, reparacion, fecha, numeroSoportePlataforma, logoTicket) {
  const lineas = [];
  if (logoTicket) lineas.push({ tipo: "imagen", dataUrl: logoTicket, alineacion: "centro" });
  lineas.push(
    ...lineasNombreEmpresa(empresa),
    { texto: `RUC ${empresa.ruc}`, alineacion: "centro" },
    { texto: `NOTA DE RECEPCIÓN N° ${reparacion.numero}`, alineacion: "centro" },
    { texto: `${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY")}`, alineacion: "centro" },
    SEPARADOR,
    { texto: `Cliente: ${reparacion.cliente_nombre}`, negrita: true }
  );
  if (reparacion.cliente_documento) lineas.push({ texto: `RUC/CI: ${reparacion.cliente_documento}` });
  if (reparacion.cliente_celular) lineas.push({ texto: `Cel: ${reparacion.cliente_celular}` });
  lineas.push(SEPARADOR);

  let equipo = reparacion.tipo_equipo;
  if (reparacion.marca) equipo += ` ${reparacion.marca}`;
  if (reparacion.modelo) equipo += ` ${reparacion.modelo}`;
  lineas.push({ texto: `Equipo: ${equipo}`, negrita: true });
  if (reparacion.numero_serie) lineas.push({ texto: `N° de serie: ${reparacion.numero_serie}` });
  if (reparacion.accesorios) lineas.push({ texto: `Accesorios: ${reparacion.accesorios}` });
  lineas.push(SEPARADOR);

  lineas.push({ texto: "Estado del equipo al recibir:", negrita: true }, ...lineasDeTexto(reparacion.estado_recibido));

  if (reparacion.comentario_cliente) {
    lineas.push(
      SEPARADOR,
      { texto: "Comentario del cliente:", negrita: true },
      ...lineasDeTexto(reparacion.comentario_cliente)
    );
  }

  lineas.push(
    SEPARADOR,
    ...lineasDeTexto(empresa.reparaciones_nota_legal || TEXTO_LEGAL_POR_DEFECTO),
    SEPARADOR,
    // Espacio real para firmar a mano, no la raya pegada al texto - el
    // cliente esta reconociendo el estado declarado del equipo.
    { texto: "" },
    { texto: "Firma del cliente:" },
    { texto: "" },
    { texto: "" },
    { texto: "____________________________", alineacion: "centro" },
    SEPARADOR,
    ...lineasPiePublicidadEmpremas(numeroSoportePlataforma)
  );
  return lineas;
}

export default function NotaRecepcionImprimible({ empresa, reparacion, accionesExtra, autoImprimir = false }) {
  const recuadroRef = useRef(null);
  const [formato, setFormato] = useState("ticket_comun");
  const yaImprimio = useRef(false);

  const [numeroSoportePlataforma, setNumeroSoportePlataforma] = useState(null);
  useEffect(() => {
    obtenerNumeroSoportePlataforma().then(setNumeroSoportePlataforma);
  }, []);

  // logoListo marca que ya se termino de intentar buscar el logo (con o
  // sin resultado) - para que la impresion automatica de abajo no dispare
  // antes de tiempo (mismo bug ya encontrado y corregido en Recibo.js).
  const [logo, setLogo] = useState(null);
  const [logoTicket, setLogoTicket] = useState(null);
  const [logoListo, setLogoListo] = useState(false);
  useEffect(() => {
    apiFetch("/api/empresas/logo")
      .then((d) => {
        setLogo(d.logo);
        return logoParaTicket(d.logo);
      })
      .then(setLogoTicket)
      .catch(() => {})
      .finally(() => setLogoListo(true));
  }, []);

  // Al recien registrar la recepcion, el cliente esta ahi esperando su
  // copia - se imprime sola una vez, sin que haga falta tocar "Imprimir".
  // Espera a que el logo este listo (con un limite de seguridad de 3s)
  // mismo criterio que el auto-print de un ticket de venta.
  useEffect(() => {
    if (!autoImprimir || yaImprimio.current) return;
    const imprimir = () => {
      yaImprimio.current = true;
      imprimirTicket(
        empresa.impresora_agente_nombre,
        lineasNotaRecepcion(empresa, reparacion, new Date(reparacion.creado_en), numeroSoportePlataforma, logoTicket),
        () => window.print()
      );
    };
    if (!logoListo) {
      const limite = setTimeout(() => {
        if (!yaImprimio.current) imprimir();
      }, 3000);
      return () => clearTimeout(limite);
    }
    imprimir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoImprimir, logoListo]);

  async function descargarImagen() {
    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const enlace = document.createElement("a");
    enlace.download = `recepcion-${reparacion.numero}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  }

  const esA4 = formato === "a4";
  const fecha = new Date(reparacion.creado_en);
  const textoLegal = empresa.reparaciones_nota_legal || TEXTO_LEGAL_POR_DEFECTO;

  let equipoTexto = reparacion.tipo_equipo;
  if (reparacion.marca) equipoTexto += ` ${reparacion.marca}`;
  if (reparacion.modelo) equipoTexto += ` ${reparacion.modelo}`;

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex justify-center gap-2">
        <button
          onClick={() => setFormato("ticket_comun")}
          className={`rounded-xl px-5 py-2 font-semibold transition ${
            formato === "ticket_comun" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          Ticket
        </button>
        <button
          onClick={() => setFormato("a4")}
          className={`rounded-xl px-5 py-2 font-semibold transition ${
            esA4 ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
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
        {logo && (
          <div className="mb-2 flex justify-center">
            <img src={logo} alt="Logo" className="max-h-20 max-w-[70%] object-contain" />
          </div>
        )}
        <p className="text-center text-2xl font-bold">{nombresEmpresa(empresa).principal}</p>
        {nombresEmpresa(empresa).secundario && (
          <p className="text-center text-sm text-slate-500">{nombresEmpresa(empresa).secundario}</p>
        )}
        <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
        <p className="mt-2 text-center text-lg font-bold">NOTA DE RECEPCIÓN N° {reparacion.numero}</p>
        <p className="text-center text-sm text-slate-500">
          {fecha.toLocaleDateString("es-PY")} {fecha.toLocaleTimeString("es-PY")}
        </p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="mb-1 font-semibold">Cliente: {reparacion.cliente_nombre}</p>
        {reparacion.cliente_documento && <p className="text-sm">RUC/CI: {reparacion.cliente_documento}</p>}
        {reparacion.cliente_celular && <p className="text-sm">Cel: {reparacion.cliente_celular}</p>}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="font-semibold">Equipo: {equipoTexto}</p>
        {reparacion.numero_serie && <p className="text-sm">N° de serie: {reparacion.numero_serie}</p>}
        {reparacion.accesorios && <p className="text-sm">Accesorios: {reparacion.accesorios}</p>}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="font-semibold">Estado del equipo al recibir:</p>
        <p className="whitespace-pre-line text-sm">{reparacion.estado_recibido}</p>

        {reparacion.comentario_cliente && (
          <>
            <div className="my-2 border-t-2 border-dashed border-slate-300" />
            <p className="font-semibold">Comentario del cliente:</p>
            <p className="whitespace-pre-line text-sm">{reparacion.comentario_cliente}</p>
          </>
        )}

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="whitespace-pre-line text-xs text-slate-400">{textoLegal}</p>

        <div className="my-2 border-t-2 border-dashed border-slate-300" />

        <p className="mt-4 text-sm text-slate-500">Firma del cliente</p>
        <div className="mt-8 border-t border-slate-400" />

        <PiePublicidadEmpremas numero={numeroSoportePlataforma} />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() =>
            esA4
              ? window.print()
              : imprimirTicket(
                  empresa.impresora_agente_nombre,
                  lineasNotaRecepcion(empresa, reparacion, fecha, numeroSoportePlataforma, logoTicket),
                  () => window.print()
                )
          }
          className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
        >
          Imprimir
        </button>
        <button
          onClick={descargarImagen}
          className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
        >
          Descargar imagen
        </button>
        {accionesExtra}
      </div>
    </div>
  );
}
