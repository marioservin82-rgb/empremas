"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { linkWhatsapp } from "@/lib/whatsapp";
import Recibo from "@/app/vender/Recibo";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function DetalleVenta() {
  const router = useRouter();
  const { id } = useParams();

  const [venta, setVenta] = useState(null);
  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [formato, setFormato] = useState("ticket_comun");
  const [error, setError] = useState("");

  const [anulando, setAnulando] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [pinAnulacion, setPinAnulacion] = useState("");
  const [enviandoAnulacion, setEnviandoAnulacion] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState("");

  function cargar() {
    return Promise.all([apiFetch(`/api/ventas/${id}`), apiFetch("/api/empresas/actual")])
      .then(([v, e]) => {
        setVenta(v);
        setEmpresaInfo(e);
        // Una venta que se hizo como Factura Legal siempre se muestra como
        // tal al reabrirla - no tiene sentido el toggle Ticket/Hoja A4 para
        // algo que ya es (o intento ser) un documento real de SIFEN.
        if (v.tipo_comprobante === "factura_legal") {
          setFormato("factura_legal");
        }
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  async function confirmarAnulacion() {
    if (!motivoAnulacion.trim()) {
      setErrorAnulacion("Indicá el motivo de la anulación");
      return;
    }
    setErrorAnulacion("");
    setEnviandoAnulacion(true);
    try {
      await apiFetch(`/api/ventas/${id}/anular`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivoAnulacion, pin: pinAnulacion || undefined }),
      });
      setAnulando(false);
      setMotivoAnulacion("");
      setPinAnulacion("");
      await cargar();
    } catch (err) {
      setErrorAnulacion(err.message);
    } finally {
      setEnviandoAnulacion(false);
    }
  }

  if (error && !venta) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!venta || !empresaInfo) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  const cliente = {
    nombre: venta.cliente_nombre || "Consumidor Final",
    documento: venta.cliente_documento,
    celular: venta.cliente_celular,
    direccion: venta.cliente_direccion,
  };

  const ventaParaRecibo = {
    id: venta.id,
    creadoEn: venta.creado_en,
    numeroTicket: venta.numero_ticket,
    total: Number(venta.total),
    vuelto: Number(venta.vuelto || 0),
    tipoPago: venta.tipo_pago,
    vencimiento: venta.vencimiento,
    saldoPendiente: Number(venta.saldo_pendiente || 0),
    pagos: venta.pagos.map((p) => ({ formaPago: p.forma_pago, monto: Number(p.monto) })),
  };

  const items = venta.items.map((i) => ({
    productoId: i.producto_id,
    nombre: i.producto_nombre,
    cantidad: Number(i.cantidad),
    precioUnitario: Number(i.precio_unitario),
    unidadMedida: i.unidad_medida,
    esMayorista: i.es_mayorista,
  }));

  const mensajeWhatsapp = `Hola ${cliente.nombre}, te paso el comprobante de tu compra en ${empresaInfo.razon_social} por Gs ${formatoGs.format(venta.total)}. (Adjunto la imagen del comprobante)`;
  const urlWhatsapp = linkWhatsapp(cliente.celular, mensajeWhatsapp);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/ventas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a Ventas
          </Link>
          <h1 className="text-2xl font-bold text-navy">Venta de {cliente.nombre}</h1>
        </div>

        {venta.anulada && (
          <div className="mb-4 rounded-2xl bg-red-50 p-5 shadow shadow-red-100">
            <p className="text-lg font-bold text-red-700">ANULADA</p>
            <p className="text-sm text-red-600">Motivo: {venta.motivo_anulacion}</p>
            <p className="text-sm text-red-600">
              {new Date(venta.anulada_en).toLocaleDateString("es-PY")}{" "}
              {new Date(venta.anulada_en).toLocaleTimeString("es-PY")} · Autorizó: {venta.anulada_por_nombre}
            </p>
          </div>
        )}

        {venta.tipo_comprobante !== "factura_legal" && (
          <div className="mb-4 flex justify-center gap-2">
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
                formato === "a4" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              Hoja A4
            </button>
          </div>
        )}

        <Recibo
          empresa={empresaInfo}
          venta={ventaParaRecibo}
          cliente={cliente}
          items={items}
          formato={formato}
          onNuevaVenta={() => router.push("/ventas")}
          textoVolver="← Volver a Ventas"
          accionesExtra={
            urlWhatsapp ? (
              <a
                href={urlWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700"
              >
                Enviar por WhatsApp
              </a>
            ) : (
              <span className="self-center text-sm text-slate-400">
                Sin celular registrado para WhatsApp
              </span>
            )
          }
        />

        {!venta.anulada && (
          <div className="mt-2 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            {!anulando ? (
              <button
                onClick={() => setAnulando(true)}
                className="w-full rounded-xl bg-red-50 py-3 font-semibold text-red-600 hover:bg-red-100"
              >
                Anular venta
              </button>
            ) : (
              <div>
                <p className="mb-3 font-semibold text-slate-700">Anular esta venta</p>
                <label className="mb-1 block text-sm font-medium text-slate-500">Motivo</label>
                <input
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  placeholder="Ej: el cliente se arrepintió"
                  className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                <label className="mb-1 block text-sm font-medium text-slate-500">
                  PIN de autorización (dueño/encargado)
                </label>
                <input
                  value={pinAnulacion}
                  onChange={(e) => setPinAnulacion(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Dejalo vacío si sos dueño/encargado"
                  inputMode="numeric"
                  className="mb-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                <p className="mb-3 text-xs text-slate-400">
                  Si sos cajero, pedile el PIN a un dueño o encargado.
                </p>

                {errorAnulacion && (
                  <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorAnulacion}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAnulando(false);
                      setErrorAnulacion("");
                    }}
                    className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarAnulacion}
                    disabled={enviandoAnulacion}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {enviandoAnulacion ? "Anulando..." : "Confirmar anulación"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
