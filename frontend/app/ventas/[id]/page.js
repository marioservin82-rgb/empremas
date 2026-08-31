"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { linkWhatsapp } from "@/lib/whatsapp";
import Recibo from "@/app/vender/Recibo";
import BuscadorCiudad from "@/app/documentos/BuscadorCiudad";
import SelectorTransporte from "@/app/documentos/remision/SelectorTransporte";

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
            {venta.tipo_comprobante === "factura_legal" && venta.de_estado === "aprobado" && (
              <CancelacionSifen venta={venta} onCambio={cargar} />
            )}
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

        {!venta.anulada && venta.tipo_comprobante === "factura_legal" && venta.de_estado === "aprobado" && (
          <GenerarRemision ventaId={id} direccionCliente={venta.cliente_direccion} />
        )}

        {venta.tipo_comprobante === "factura_legal" && venta.de_estado === "aprobado" && (
          venta.cliente_es_generico ? (
            <p className="mt-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700 shadow shadow-slate-200">
              Esta factura es a Consumidor Final — SIFEN no permite emitirle Nota de Crédito/Débito.
              Para poder anularla con NC, la factura tiene que estar a nombre de un cliente con RUC o cédula.
            </p>
          ) : (
            <NotasDeFactura ventaId={id} items={items} totalFactura={Number(venta.total)} />
          )
        )}

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

const MOTIVOS_NC = [
  { v: 2, t: "Devolución (la mercadería vuelve al stock)" },
  { v: 3, t: "Descuento" },
  { v: 4, t: "Bonificación" },
  { v: 8, t: "Ajuste de precio" },
  { v: 5, t: "Crédito incobrable" },
];
const MOTIVOS_ND = [
  { v: 7, t: "Recupero de gasto" },
  { v: 6, t: "Recupero de costo" },
  { v: 8, t: "Ajuste de precio" },
];

function NotasDeFactura({ ventaId, items, totalFactura }) {
  const router = useRouter();
  const [notas, setNotas] = useState([]);
  const [modo, setModo] = useState(null); // null | "credito" | "debito"
  const [motivo, setMotivo] = useState(2);
  const [obs, setObs] = useState("");
  const [esTotal, setEsTotal] = useState(true);
  const [cant, setCant] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const cargar = () => apiFetch(`/api/notas/de-venta/${ventaId}`).then(setNotas).catch(() => {});
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId]);

  function abrir(tipo) {
    setModo(tipo);
    setMotivo(tipo === "debito" ? 7 : 2);
    setEsTotal(true);
    setCant(Object.fromEntries(items.map((i) => [i.productoId, i.cantidad])));
    setObs("");
    setError("");
  }

  async function emitir() {
    setError("");
    setEnviando(true);
    try {
      const body = { tipo: modo, ventaId, motivo, observacion: obs || null };
      if (esTotal) body.esTotal = true;
      else
        body.items = items
          .filter((i) => Number(cant[i.productoId]) > 0)
          .map((i) => ({ productoId: i.productoId, cantidad: Number(cant[i.productoId]) }));
      const n = await apiFetch("/api/notas", { method: "POST", body: JSON.stringify(body) });
      router.push(`/documentos/notas/${n.id}`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const motivos = modo === "debito" ? MOTIVOS_ND : MOTIVOS_NC;

  return (
    <div className="mt-2 rounded-2xl bg-white p-5 shadow shadow-slate-200">
      {notas.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {notas.map((n) => (
            <Link
              key={n.id}
              href={`/documentos/notas/${n.id}`}
              className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
            >
              <span className="font-semibold text-slate-700">
                {n.tipo === "credito" ? "Nota de Crédito" : "Nota de Débito"} {n.numero_formateado || ""}
              </span>
              <span className="text-slate-500">Gs {formatoGs.format(n.total)}</span>
            </Link>
          ))}
        </div>
      )}

      {!modo ? (
        <div className="flex gap-2">
          <button
            onClick={() => abrir("credito")}
            className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200"
          >
            Nota de Crédito
          </button>
          <button
            onClick={() => abrir("debito")}
            className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200"
          >
            Nota de Débito
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-2 font-semibold text-slate-700">
            {modo === "credito" ? "Nueva Nota de Crédito" : "Nueva Nota de Débito"}
          </p>

          <label className="mb-1 block text-sm font-medium text-slate-500">Motivo</label>
          <select
            value={motivo}
            onChange={(e) => setMotivo(Number(e.target.value))}
            className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy"
          >
            {motivos.map((m) => (
              <option key={m.v} value={m.v}>
                {m.t}
              </option>
            ))}
          </select>

          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={esTotal} onChange={(e) => setEsTotal(e.target.checked)} />
            Toda la factura (Gs {formatoGs.format(totalFactura)})
          </label>

          {!esTotal && (
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
              {items.map((i) => (
                <div key={i.productoId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-slate-700">
                    {i.nombre} <span className="text-slate-400">(vendido: {i.cantidad})</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={i.cantidad}
                    step="any"
                    value={cant[i.productoId] ?? 0}
                    onChange={(e) => setCant((c) => ({ ...c, [i.productoId]: e.target.value }))}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right"
                  />
                </div>
              ))}
            </div>
          )}

          <label className="mb-1 block text-sm font-medium text-slate-500">Observación (opcional)</label>
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy"
          />

          {modo === "credito" && esTotal && (
            <p className="mb-3 text-xs text-amber-600">
              Al ser por el total, la factura queda anulada y {motivo === 2 ? "la mercadería vuelve al stock" : "no se toca el stock"}.
            </p>
          )}
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={emitir}
              disabled={enviando}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-50"
            >
              {enviando ? "Emitiendo…" : `Emitir ${modo === "credito" ? "NC" : "ND"}`}
            </button>
            <button
              onClick={() => setModo(null)}
              className="rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GenerarRemision({ ventaId, direccionCliente }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [direccion, setDireccion] = useState(direccionCliente || "");
  const [ciudadEntrega, setCiudadEntrega] = useState(null);
  const [transporte, setTransporte] = useState({ modoTransporte: "propio" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function generar() {
    setError("");
    setEnviando(true);
    try {
      const r = await apiFetch("/api/remisiones/desde-venta", {
        method: "POST",
        body: JSON.stringify({
          ventaId,
          direccionEntrega: direccion,
          ciudadEntrega: ciudadEntrega?.codigo || null,
          ...transporte,
        }),
      });
      router.push(`/documentos/remision/${r.id}`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <div className="mt-2 rounded-2xl bg-white p-5 shadow shadow-slate-200">
      {!abierto ? (
        <button
          onClick={() => setAbierto(true)}
          className="w-full rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200"
        >
          Generar Nota de Remisión de esta factura
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-slate-700">Nota de Remisión</p>
          <p className="-mt-2 text-xs text-slate-400">Usa los mismos ítems y cliente de la factura.</p>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-500">Dirección de entrega (destino)</label>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy"
              placeholder="Calle, barrio, referencia"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-500">Ciudad del destino</label>
            <BuscadorCiudad valor={ciudadEntrega} onSelect={setCiudadEntrega} placeholder="Buscar ciudad del destino" />
          </div>

          <SelectorTransporte onChange={setTransporte} />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={generar}
              disabled={enviando || !direccion.trim()}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-50"
            >
              {enviando ? "Emitiendo…" : "Emitir remisión"}
            </button>
            <button
              onClick={() => setAbierto(false)}
              className="rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Estado de la cancelación en SIFEN de una Factura Legal anulada.
function CancelacionSifen({ venta, onCambio }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function cancelar() {
    setError("");
    setEnviando(true);
    try {
      await apiFetch(`/api/ventas/${venta.id}/cancelar-sifen`, {
        method: "POST",
        body: JSON.stringify({ motivo: venta.motivo_anulacion || "Anulación de la venta" }),
      });
      await onCambio();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  if (venta.de_cancelado_en_sifen) {
    return <p className="mt-2 text-sm font-semibold text-red-700">✓ Cancelada también en SIFEN</p>;
  }

  return (
    <div className="mt-3 border-t border-red-200 pt-3">
      <p className="mb-1 text-sm font-semibold text-red-700">Todavía NO está cancelada en SIFEN</p>
      {venta.de_cancelacion_mensaje && (
        <p className="mb-2 text-xs text-red-600">Último intento: {venta.de_cancelacion_mensaje}</p>
      )}
      <p className="mb-2 text-xs text-red-500">
        La cancelación en SIFEN sólo se puede hacer dentro de las 48 horas de emitida la factura.
      </p>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <button
        onClick={cancelar}
        disabled={enviando}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {enviando ? "Cancelando…" : "Cancelar en SIFEN"}
      </button>
    </div>
  );
}
