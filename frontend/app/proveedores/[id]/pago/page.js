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

export default function PagoProveedor() {
  const router = useRouter();
  const { id } = useParams();
  const [proveedor, setProveedor] = useState(null);
  const [monto, setMonto] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [fechaPago, setFechaPago] = useState(hoy());
  const [numeroRecibo, setNumeroRecibo] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch(`/api/proveedores/${id}`)
      .then(setProveedor)
      .catch((err) => setError(err.message));
  }, [id, router]);

  const puedeConfirmar = proveedor && Number(monto) > 0 && Number(monto) <= Number(proveedor.saldo) && formaPago;

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const pago = await apiFetch(`/api/proveedores/${id}/pagos`, {
        method: "POST",
        body: JSON.stringify({ monto: Number(monto), formaPago, fechaPago, numeroRecibo: numeroRecibo || undefined }),
      });
      setExito(`Pago registrado — Gs ${formatoGs.format(pago.monto)}. Saldo restante: Gs ${formatoGs.format(pago.saldoRestante)}`);
      setProveedor((actual) => ({ ...actual, saldo: pago.saldoRestante }));
      setMonto("");
      setFormaPago("");
      setFechaPago(hoy());
      setNumeroRecibo("");
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
      <div className="w-full max-w-sm">
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
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

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
