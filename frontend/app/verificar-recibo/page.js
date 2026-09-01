"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const formatoGs = new Intl.NumberFormat("es-PY");

const MOTIVO_TEXTO = {
  faltan_datos: "El código escaneado no trae los datos necesarios para verificar.",
  no_encontrado: "No existe ningún recibo emitido con estos datos.",
  no_coincide: "El monto o los datos de este recibo no coinciden con lo emitido — no lo aceptes como válido sin confirmar con el comercio.",
};

// Publica, sin login: a esto apunta el QR impreso en el recibo de cobro -
// useSearchParams() exige un limite de Suspense arriba, por eso el
// default export es solo el wrapper (mismo criterio ya usado en
// gastos/salida-stock).
export default function VerificarRecibo() {
  return (
    <Suspense fallback={null}>
      <VerificarReciboContenido />
    </Suspense>
  );
}

function VerificarReciboContenido() {
  const searchParams = useSearchParams();
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const empresaId = searchParams.get("e");
    const id = searchParams.get("id");
    const h = searchParams.get("h");
    if (!empresaId || !id || !h) {
      setResultado({ valido: false, motivo: "faltan_datos" });
      return;
    }
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${BASE_URL}/api/verificar-recibo?empresaId=${empresaId}&id=${id}&h=${h}`)
      .then((r) => r.json())
      .then(setResultado)
      .catch(() => setError("No se pudo conectar para verificar el recibo. Probá de nuevo."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-1 text-2xl font-bold text-navy">Verificar recibo</h1>
        <p className="mb-6 text-sm text-slate-400">Comprobante emitido por EMPREMAS</p>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!resultado && !error && <p className="text-slate-500">Verificando...</p>}

        {resultado?.valido && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <p className="mb-3 text-4xl">✅</p>
            <p className="mb-1 text-lg font-bold text-emerald-700">Recibo válido</p>
            <p className="mb-4 text-sm text-emerald-600">Coincide con lo emitido por el sistema</p>
            <div className="rounded-xl bg-white p-4 text-left text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Recibo</span>
                <span className="font-semibold text-slate-800">N° {resultado.numeroRecibo}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Cliente</span>
                <span className="font-semibold text-slate-800">{resultado.clienteNombre}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Monto</span>
                <span className="font-semibold text-slate-800">Gs {formatoGs.format(resultado.monto)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Fecha</span>
                <span className="font-semibold text-slate-800">
                  {new Date(resultado.fecha).toLocaleDateString("es-PY")}
                </span>
              </div>
            </div>
          </div>
        )}

        {resultado && !resultado.valido && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <p className="mb-3 text-4xl">⚠️</p>
            <p className="mb-2 text-lg font-bold text-red-700">No coincide</p>
            <p className="text-sm text-red-700">{MOTIVO_TEXTO[resultado.motivo] || "No se pudo verificar este recibo."}</p>
          </div>
        )}

        <p className="mt-8">
          <Link href="/" className="text-sm font-medium text-navy hover:text-brand">
            Ir a EMPREMAS →
          </Link>
        </p>
      </div>
    </main>
  );
}
