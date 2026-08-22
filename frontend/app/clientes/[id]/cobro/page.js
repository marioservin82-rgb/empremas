"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ReciboCobro from "./ReciboCobro";
import ComprobanteInternoCuenta from "./ComprobanteInternoCuenta";

const formatoGs = new Intl.NumberFormat("es-PY");

const FORMAS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta de crédito" },
  { valor: "tarjeta_debito", etiqueta: "Tarjeta de débito" },
];

const ETIQUETA_FORMA_PAGO = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.etiqueta]));

function referenciaFactura(f) {
  return f.de_numero_formateado ? `Factura ${f.de_numero_formateado}` : `Ticket N° ${f.numero_ticket}`;
}

export default function CobroCliente() {
  const router = useRouter();
  const { id } = useParams();

  const [cliente, setCliente] = useState(null);
  const [facturas, setFacturas] = useState([]);
  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [facturaIdsSeleccionadas, setFacturaIdsSeleccionadas] = useState([]);

  const [pagos, setPagos] = useState([]);
  const [nuevoPagoForma, setNuevoPagoForma] = useState("");
  const [nuevoPagoMonto, setNuevoPagoMonto] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recibo, setRecibo] = useState(null);
  const [vistaRecibo, setVistaRecibo] = useState("recibo");

  async function cargarTodo() {
    try {
      const [c, f, e] = await Promise.all([
        apiFetch(`/api/clientes/${id}`),
        apiFetch(`/api/clientes/${id}/facturas-pendientes`),
        apiFetch(`/api/empresas/actual`),
      ]);
      setCliente(c);
      setFacturas(f);
      // Con una sola factura pendiente, se preselecciona sola (menos
      // friccion en el caso mas comun) - con varias, arranca sin marcar
      // ninguna para que sea una eleccion explicita.
      setFacturaIdsSeleccionadas(f.length === 1 ? [f[0].id] : []);
      setEmpresaInfo(e);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  function alternarFactura(facturaId) {
    setFacturaIdsSeleccionadas((actual) =>
      actual.includes(facturaId) ? actual.filter((idActual) => idActual !== facturaId) : [...actual, facturaId]
    );
  }

  const montoSeleccionado = facturas
    .filter((f) => facturaIdsSeleccionadas.includes(f.id))
    .reduce((acumulado, f) => acumulado + Number(f.saldo_pendiente), 0);

  const totalPagos = pagos.reduce((acumulado, p) => acumulado + Number(p.monto), 0);

  function elegirFormaNuevoPago(valor) {
    setNuevoPagoForma(valor);
    if (!nuevoPagoMonto) {
      // Si no hay ninguna factura para elegir (deuda migrada/ajustada sin
      // ventas asociadas), no hay nada de que restar montoSeleccionado -
      // se completa con el saldo total del cliente, igual que antes de
      // que existiera el selector de facturas.
      const base = facturas.length > 0 ? montoSeleccionado : Number(cliente.saldo);
      const restanteSaldo = base - totalPagos;
      setNuevoPagoMonto(String(Math.max(restanteSaldo, 0)));
    }
  }

  function agregarPago() {
    if (!nuevoPagoForma || !(Number(nuevoPagoMonto) > 0)) return;
    setPagos((actual) => [...actual, { formaPago: nuevoPagoForma, monto: Number(nuevoPagoMonto) }]);
    setNuevoPagoForma("");
    setNuevoPagoMonto("");
  }

  function quitarPago(indice) {
    setPagos((actual) => actual.filter((_, i) => i !== indice));
  }

  const puedeConfirmar =
    pagos.length > 0 &&
    totalPagos > 0 &&
    cliente &&
    totalPagos <= Number(cliente.saldo) &&
    (facturas.length === 0 || facturaIdsSeleccionadas.length > 0);

  async function confirmarCobro() {
    setError("");
    setEnviando(true);
    try {
      const cobro = await apiFetch(`/api/clientes/${id}/cobros`, {
        method: "POST",
        body: JSON.stringify({ monto: totalPagos, pagos, facturaIds: facturaIdsSeleccionadas }),
      });
      setVistaRecibo("recibo");
      setRecibo(cobro);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function nuevoCobro() {
    setRecibo(null);
    setPagos([]);
    setNuevoPagoForma("");
    setNuevoPagoMonto("");
    setError("");
    await cargarTodo();
  }

  if (!cliente) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-slate-500">Cargando...</p>
        )}
      </main>
    );
  }

  if (recibo) {
    return (
      <main className="flex flex-1 flex-col items-center p-6">
        <div className="w-full max-w-2xl">
          <div className="py-6">
            <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Cobro registrado</h1>
          </div>

          {recibo.clienteSaldoQuedaEnCero && (
            <div className="mb-4 rounded-2xl border border-navy/20 bg-tint p-4 text-center print:hidden">
              <p className="font-semibold text-navy">
                ✅ El cliente saldó su deuda — no te olvides de devolverle el pagaré.
              </p>
            </div>
          )}

          <div className="mb-4 flex justify-center gap-2 print:hidden">
            <button
              onClick={() => setVistaRecibo("recibo")}
              className={`rounded-xl px-5 py-2 font-semibold transition ${
                vistaRecibo === "recibo" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              Recibo de cobro
            </button>
            <button
              onClick={() => setVistaRecibo("interno")}
              className={`rounded-xl px-5 py-2 font-semibold transition ${
                vistaRecibo === "interno" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              Comprobante interno de cuenta
            </button>
          </div>

          {empresaInfo &&
            (vistaRecibo === "recibo" ? (
              <ReciboCobro empresa={empresaInfo} cobro={recibo} cliente={cliente} onNuevoCobro={nuevoCobro} />
            ) : (
              <ComprobanteInternoCuenta empresa={empresaInfo} cobro={recibo} cliente={cliente} onNuevoCobro={nuevoCobro} />
            ))}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Cobrar a {cliente.nombre}</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 text-center shadow shadow-slate-200">
          <p className="text-sm text-slate-400">Te debe</p>
          <p className="text-3xl font-extrabold text-amber-600">Gs {formatoGs.format(cliente.saldo)}</p>
        </div>

        {facturas.length > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-slate-700">Facturas pendientes</p>
              {facturas.length > 1 && (
                <div className="flex gap-3 text-sm font-semibold text-navy">
                  <button onClick={() => setFacturaIdsSeleccionadas(facturas.map((f) => f.id))} className="hover:text-brand">
                    Seleccionar todas
                  </button>
                  <button onClick={() => setFacturaIdsSeleccionadas([])} className="hover:text-brand">
                    Ninguna
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              {facturas.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={facturaIdsSeleccionadas.includes(f.id)}
                    onChange={() => alternarFactura(f.id)}
                    className="h-5 w-5 rounded border-slate-300"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{referenciaFactura(f)}</p>
                    <p className="text-slate-400">Vence {new Date(f.vencimiento).toLocaleDateString("es-PY")}</p>
                  </div>
                  <span className="font-semibold text-slate-800">Gs {formatoGs.format(f.saldo_pendiente)}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">Elegí a qué factura(s) corresponde este pago.</p>
          </div>
        )}

        <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-2 text-sm font-medium text-slate-500">¿Cómo te paga?</p>

          {pagos.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {pagos.map((p, indice) => (
                <div key={indice} className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2">
                  <span className="font-semibold text-slate-700">{ETIQUETA_FORMA_PAGO[p.formaPago]}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-700">Gs {formatoGs.format(p.monto)}</span>
                    <button onClick={() => quitarPago(indice)} className="text-red-500 hover:text-red-700">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGO.map((f) => (
              <button
                key={f.valor}
                onClick={() => elegirFormaNuevoPago(f.valor)}
                className={`rounded-xl py-3 font-semibold transition ${
                  nuevoPagoForma === f.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>

          {nuevoPagoForma && (
            <div className="mt-3">
              <input
                type="number"
                min="0"
                value={nuevoPagoMonto}
                onChange={(e) => setNuevoPagoMonto(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                placeholder="0"
              />
              <button
                onClick={agregarPago}
                disabled={!(Number(nuevoPagoMonto) > 0)}
                className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-50"
              >
                Agregar {ETIQUETA_FORMA_PAGO[nuevoPagoForma].toLowerCase()}
              </button>
            </div>
          )}

          {pagos.length > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <p className="text-lg font-semibold text-slate-600">Total a cobrar</p>
              <p className="text-3xl font-extrabold text-navy">Gs {formatoGs.format(totalPagos)}</p>
            </div>
          )}

          {totalPagos > Number(cliente.saldo) ? (
            <p className="mt-2 text-sm font-semibold text-red-600">
              Eso es más de lo que te debe (Gs {formatoGs.format(cliente.saldo)})
            </p>
          ) : (
            // Solo tiene sentido este aviso si habia algo para elegir - un
            // cliente con deuda migrada/ajustada (sin ninguna factura
            // asociada) no tiene "facturas elegidas" con las que comparar.
            facturas.length > 0 &&
            totalPagos > montoSeleccionado && (
              <p className="mt-2 text-sm font-semibold text-amber-600">
                Estás cobrando más de lo que suman las facturas elegidas — el excedente baja la deuda general sin
                quedar asociado a una factura puntual.
              </p>
            )
          )}

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            onClick={confirmarCobro}
            disabled={enviando || !puedeConfirmar}
            className="mt-4 w-full rounded-xl bg-brand py-4 text-xl font-bold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {enviando ? "Guardando..." : "Confirmar cobro"}
          </button>
        </div>
      </div>
    </main>
  );
}
