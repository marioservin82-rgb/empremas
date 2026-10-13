"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const FORMAS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta de crédito" },
  { valor: "tarjeta_debito", etiqueta: "Tarjeta de débito" },
];

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function referenciaCompra(c) {
  const fechaTexto = new Date(c.fecha_compra).toLocaleDateString("es-PY");
  return c.numero_factura ? `Factura ${c.numero_factura} · ${fechaTexto}` : `Compra del ${fechaTexto}`;
}

export default function PagoProveedor() {
  const router = useRouter();
  const { id } = useParams();
  const [proveedor, setProveedor] = useState(null);
  const [compras, setCompras] = useState([]);
  const [compraIdsSeleccionadas, setCompraIdsSeleccionadas] = useState([]);
  const [incluirSaldoSinFactura, setIncluirSaldoSinFactura] = useState(false);
  const [monto, setMonto] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [fechaPago, setFechaPago] = useState(hoy());
  const [numeroRecibo, setNumeroRecibo] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cargarTodo() {
    try {
      const [p, c] = await Promise.all([
        apiFetch(`/api/proveedores/${id}`),
        apiFetch(`/api/proveedores/${id}/compras-pendientes`),
      ]);
      setProveedor(p);
      setCompras(c);
      const sinFactura = Math.max(
        Number(p.saldo) - c.reduce((suma, compra) => suma + Number(compra.saldo_pendiente), 0),
        0
      );
      // Un solo item para elegir -> se preselecciona solo (menos fricción);
      // con varios arranca sin marcar nada, para que sea una elección explícita.
      const haySinFactura = sinFactura > 0.01;
      const totalSeleccionable = c.length + (haySinFactura ? 1 : 0);
      const ids = totalSeleccionable === 1 && c.length === 1 ? [c[0].id] : [];
      const incluir = totalSeleccionable === 1 && haySinFactura;
      setCompraIdsSeleccionadas(ids);
      setIncluirSaldoSinFactura(incluir);
      const sugerido =
        c.filter((x) => ids.includes(x.id)).reduce((suma, x) => suma + Number(x.saldo_pendiente), 0) +
        (incluir ? sinFactura : 0);
      setMonto(sugerido > 0 ? String(sugerido) : "");
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

  const saldoSinFactura = proveedor
    ? Math.max(Number(proveedor.saldo) - compras.reduce((suma, c) => suma + Number(c.saldo_pendiente), 0), 0)
    : 0;
  const haySaldoSinFactura = saldoSinFactura > 0.01;
  const totalSeleccionable = compras.length + (haySaldoSinFactura ? 1 : 0);

  function montoDe(ids, incluirSin) {
    return (
      compras.filter((c) => ids.includes(c.id)).reduce((suma, c) => suma + Number(c.saldo_pendiente), 0) +
      (incluirSin ? saldoSinFactura : 0)
    );
  }

  // Al cambiar lo que se está pagando, el monto se completa con la suma de
  // lo elegido (se puede bajar a mano para un pago parcial).
  function actualizarSeleccion(ids, incluirSin) {
    setCompraIdsSeleccionadas(ids);
    setIncluirSaldoSinFactura(incluirSin);
    const nuevo = montoDe(ids, incluirSin);
    setMonto(nuevo > 0 ? String(nuevo) : "");
  }

  function alternarCompra(compraId) {
    const ids = compraIdsSeleccionadas.includes(compraId)
      ? compraIdsSeleccionadas.filter((x) => x !== compraId)
      : [...compraIdsSeleccionadas, compraId];
    actualizarSeleccion(ids, incluirSaldoSinFactura);
  }

  const montoSeleccionado = montoDe(compraIdsSeleccionadas, incluirSaldoSinFactura);
  const hayEleccion = compraIdsSeleccionadas.length > 0 || incluirSaldoSinFactura;

  const puedeConfirmar =
    proveedor &&
    Number(monto) > 0 &&
    Number(monto) <= Number(proveedor.saldo) &&
    formaPago &&
    (totalSeleccionable === 0 || hayEleccion);

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const pago = await apiFetch(`/api/proveedores/${id}/pagos`, {
        method: "POST",
        body: JSON.stringify({
          monto: Number(monto),
          formaPago,
          fechaPago,
          numeroRecibo: numeroRecibo || undefined,
          compraIds: compraIdsSeleccionadas,
          incluirSaldoSinFactura,
        }),
      });
      setExito(`Pago registrado — Gs ${formatoGs.format(pago.monto)}. Saldo restante: Gs ${formatoGs.format(pago.saldoRestante)}`);
      setFormaPago("");
      setFechaPago(hoy());
      setNumeroRecibo("");
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!proveedor) {
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

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Link href="/proveedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Pagar a {proveedor.nombre}</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 text-center shadow shadow-slate-200">
          <p className="text-sm text-slate-400">Le debemos</p>
          <p className="text-3xl font-extrabold text-amber-600">Gs {formatoGs.format(proveedor.saldo)}</p>
        </div>

        {exito && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>
        )}

        {Number(proveedor.saldo) > 0 && totalSeleccionable > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-slate-700">Compras pendientes</p>
              {totalSeleccionable > 1 && (
                <div className="flex gap-3 text-sm font-semibold text-navy">
                  <button
                    onClick={() => actualizarSeleccion(compras.map((c) => c.id), haySaldoSinFactura)}
                    className="hover:text-brand"
                  >
                    Seleccionar todas
                  </button>
                  <button onClick={() => actualizarSeleccion([], false)} className="hover:text-brand">
                    Ninguna
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              {compras.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={compraIdsSeleccionadas.includes(c.id)}
                    onChange={() => alternarCompra(c.id)}
                    className="h-5 w-5 rounded border-slate-300"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{referenciaCompra(c)}</p>
                    <p className="text-slate-400">Total de la compra Gs {formatoGs.format(c.total)}</p>
                  </div>
                  <span className="font-semibold text-slate-800">Gs {formatoGs.format(c.saldo_pendiente)}</span>
                </label>
              ))}
              {haySaldoSinFactura && (
                <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={incluirSaldoSinFactura}
                    onChange={() => actualizarSeleccion(compraIdsSeleccionadas, !incluirSaldoSinFactura)}
                    className="h-5 w-5 rounded border-slate-300"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">Deuda sin compra asociada</p>
                    <p className="text-slate-400">Saldo inicial o corregido a mano, sin compra en el sistema</p>
                  </div>
                  <span className="font-semibold text-slate-800">Gs {formatoGs.format(saldoSinFactura)}</span>
                </label>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-400">Elegí a qué compra(s) corresponde este pago.</p>
          </div>
        )}

        {Number(proveedor.saldo) > 0 && (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <label className="mb-1 block text-sm font-medium text-slate-700">Monto a pagar (Gs)</label>
            <input
              type="number"
              min="0"
              max={proveedor.saldo}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
            {hayEleccion && Number(monto) > 0 && Number(monto) < montoSeleccionado && (
              <p className="mb-2 text-xs text-slate-500">
                Pago parcial: se aplica a lo elegido en orden de fecha y el resto de esa compra queda pendiente.
              </p>
            )}
            {hayEleccion && Number(monto) > montoSeleccionado && (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                El monto supera lo elegido (Gs {formatoGs.format(montoSeleccionado)}): el excedente solo baja la deuda
                general, sin quedar aplicado a una compra.
              </p>
            )}
            <div className="mb-4" />

            <p className="mb-2 text-sm font-medium text-slate-700">Forma de pago</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {FORMAS_PAGO.map((f) => (
                <button
                  key={f.valor}
                  onClick={() => setFormaPago(f.valor)}
                  className={`rounded-xl py-3 font-semibold transition ${
                    formaPago === f.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.etiqueta}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha de pago</label>
            <input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            <label className="mb-1 block text-sm font-medium text-slate-700">N° de recibo (opcional)</label>
            <input
              value={numeroRecibo}
              onChange={(e) => setNumeroRecibo(e.target.value)}
              placeholder="Recibo que te dio el proveedor"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              onClick={confirmar}
              disabled={enviando || !puedeConfirmar}
              className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {enviando ? "Guardando..." : "Confirmar pago"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
