"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function ConfiguracionImpresora() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState(null);
  const [escala, setEscala] = useState(100);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/actual")
      .then((e) => {
        setEmpresa(e);
        setEscala(e.ticket_escala ?? 100);
      })
      .catch((err) => setError(err.message));
  }, [router]);

  async function guardar() {
    setError("");
    setExito(false);
    setGuardando(true);
    try {
      const actualizado = await apiFetch("/api/empresas/actual", {
        method: "PATCH",
        body: JSON.stringify({ ticketEscala: Number(escala) }),
      });
      setEmpresa((e) => ({ ...e, ...actualizado }));
      setExito(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!empresa) {
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
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-sm">
        <div className="py-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Impresora de tickets</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ajustá el tamaño de letra del ticket (80mm) hasta que se vea bien en tu impresora.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tamaño de letra: {escala}%
          </label>
          <input
            type="range"
            min="50"
            max="300"
            step="10"
            value={escala}
            onChange={(e) => setEscala(e.target.value)}
            className="mb-2 w-full"
          />
          <div className="mb-4 flex justify-between text-xs text-slate-400">
            <span>50%</span>
            <span>100% (normal)</span>
            <span>300%</span>
          </div>

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>}

          <button
            onClick={guardar}
            disabled={guardando}
            className="w-full rounded-xl bg-blue-700 py-3 text-lg font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>

        <p className="mb-2 mt-6 text-sm font-medium text-slate-500">
          Vista previa (así se ve, movete el control de arriba para probar)
        </p>
        <div className="flex justify-center rounded-2xl bg-slate-100 p-6">
          <div
            className="w-[80mm] rounded-xl bg-white p-[3mm] text-base text-slate-800 shadow"
            style={{ zoom: Number(escala) / 100, fontFamily: '"Times New Roman", Times, serif' }}
          >
            <p className="text-center text-2xl font-bold">{empresa.razon_social}</p>
            <p className="text-center text-sm text-slate-500">RUC {empresa.ruc}</p>
            <div className="my-2 border-t-2 border-dashed border-slate-300" />
            <p className="mb-1 font-semibold">Cliente: Consumidor Final</p>
            <div className="my-2 border-t-2 border-dashed border-slate-300" />
            <div className="mb-2">
              <p>1 x Producto de ejemplo</p>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Gs 15.000 c/u</span>
                <span className="font-semibold text-slate-800">Gs 15.000</span>
              </div>
            </div>
            <div className="my-2 border-t-2 border-dashed border-slate-300" />
            <div className="flex justify-between text-2xl font-bold">
              <span>Total</span>
              <span>Gs {formatoGs.format(15000)}</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          Esta vista previa aproxima lo impreso, pero probá siempre con una venta real antes de confiar en un valor.
        </p>
      </div>
    </main>
  );
}
