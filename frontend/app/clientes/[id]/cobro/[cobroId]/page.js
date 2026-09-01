"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ReciboCobro from "../ReciboCobro";

// Reimpresion de un Recibo de Cobro ya emitido - mismo componente
// ReciboCobro que se usa recien confirmado el cobro (mismo QR de
// verificacion, mismo sello, misma firma), solo que los datos vienen de
// GET /api/clientes/:id/cobros/:cobroId en vez de la respuesta del POST.
// Sin toggle a "Comprobante interno de cuenta" a proposito: ese
// comprobante depende del saldo del cliente en el momento del cobro
// (saldoAnterior/saldoRestante), que ya no se puede reconstruir con
// fidelidad despues de que el saldo siguio moviendose.
export default function ReimprimirCobro() {
  const router = useRouter();
  const { id, cobroId } = useParams();

  const [cliente, setCliente] = useState(null);
  const [cobro, setCobro] = useState(null);
  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    Promise.all([
      apiFetch(`/api/clientes/${id}`),
      apiFetch(`/api/clientes/${id}/cobros/${cobroId}`),
      apiFetch("/api/empresas/actual"),
    ])
      .then(([c, cb, e]) => {
        setCliente(c);
        setCobro(cb);
        setEmpresaInfo(e);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cobroId, router]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!cliente || !cobro || !empresaInfo) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href={`/clientes/${id}/extracto`} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver al extracto
          </Link>
          <h1 className="text-2xl font-bold text-navy">
            Recibo N° {cobro.numeroRecibo} de {cliente.nombre}
          </h1>
        </div>

        <ReciboCobro
          empresa={empresaInfo}
          cobro={cobro}
          cliente={cliente}
          emisorNombre={cobro.emisorNombre}
          onNuevoCobro={() => router.push(`/clientes/${id}/cobro`)}
        />
      </div>
    </main>
  );
}
