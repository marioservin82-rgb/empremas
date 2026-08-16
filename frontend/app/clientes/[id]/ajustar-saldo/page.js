"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function AjustarSaldoCliente() {
  const router = useRouter();
  const { id } = useParams();

  const [cliente, setCliente] = useState(null);
  const [saldoNuevo, setSaldoNuevo] = useState("");
  const [motivo, setMotivo] = useState("");

  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch(`/api/clientes/${id}`)
      .then((c) => {
        setCliente(c);
        setSaldoNuevo(String(c.saldo));
      })
      .catch((err) => setError(err.message));
  }, [router, id]);

  const diferencia = cliente ? Number(saldoNuevo || 0) - Number(cliente.saldo) : 0;
  const puedeConfirmar = cliente && saldoNuevo !== "" && motivo.trim().length > 0;

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const ajuste = await apiFetch(`/api/clientes/${id}/ajustes-saldo`, {
        method: "POST",
        body: JSON.stringify({ saldoNuevo: Number(saldoNuevo), motivo: motivo.trim() }),
      });
      setExito(
        `Ajustado: ${ajuste.clienteNombre} pasó de Gs ${formatoGs.format(ajuste.saldoAnterior)} a Gs ${formatoGs.format(ajuste.saldoNuevo)} (${ajuste.diferencia >= 0 ? "+" : ""}Gs ${formatoGs.format(ajuste.diferencia)})`
      );
      setCliente((actual) => ({ ...actual, saldo: ajuste.saldoNuevo }));
      setMotivo("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
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

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link href={`/clientes/${id}/extracto`} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Ajustar saldo</h1>
        </div>

        {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>}

        <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <p className="mb-1 font-bold text-slate-800">{cliente.nombre}</p>
          <p className="mb-4 text-sm text-slate-400">Saldo actual: Gs {formatoGs.format(cliente.saldo)}</p>

          <label className="mb-1 block text-sm font-medium text-slate-700">Saldo nuevo (Gs)</label>
          <input
            type="number"
            min="0"
            value={saldoNuevo}
            onChange={(e) => setSaldoNuevo(e.target.value)}
            className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
          {saldoNuevo !== "" && diferencia !== 0 && (
            <p className={`mb-4 text-sm font-semibold ${diferencia > 0 ? "text-red-600" : "text-emerald-600"}`}>
              Diferencia: {diferencia > 0 ? "+" : ""}
              Gs {formatoGs.format(diferencia)}
            </p>
          )}

          <label className="mb-1 block text-sm font-medium text-slate-700">Motivo</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: migración de otro sistema, corrección de carga..."
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            onClick={confirmar}
            disabled={enviando || !puedeConfirmar}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {enviando ? "Guardando..." : "Confirmar ajuste"}
          </button>
        </div>
      </div>
    </main>
  );
}
