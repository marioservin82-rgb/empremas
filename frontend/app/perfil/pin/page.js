"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function MiPin() {
  const router = useRouter();
  const [tienePin, setTienePin] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmarPin, setConfirmarPin] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/mi-pin")
      .then((r) => setTienePin(r.tienePin))
      .catch((err) => setError(err.message));
  }, [router]);

  async function guardar() {
    setError("");
    setExito(false);
    if (pin.length !== 4) {
      setError("El PIN debe tener 4 dígitos");
      return;
    }
    if (pin !== confirmarPin) {
      setError("Los PIN no coinciden");
      return;
    }
    setEnviando(true);
    try {
      await apiFetch("/api/usuarios/mi-pin", { method: "PATCH", body: JSON.stringify({ pin }) });
      setExito(true);
      setTienePin(true);
      setPin("");
      setConfirmarPin("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="py-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Mi PIN de autorización</h1>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-4 text-sm text-slate-500">
            Este PIN de 4 dígitos lo usa un cajero para pedirte autorización cuando necesita anular una venta —
            no hace falta que le des tu contraseña.
          </p>

          {tienePin && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Ya tenés un PIN configurado. Podés cambiarlo acá abajo.
            </p>
          )}

          <label className="mb-1 block text-sm font-medium text-slate-500">Nuevo PIN (4 dígitos)</label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            type="password"
            className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg tracking-widest outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />

          <label className="mb-1 block text-sm font-medium text-slate-500">Confirmar PIN</label>
          <input
            value={confirmarPin}
            onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            type="password"
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg tracking-widest outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">PIN guardado.</p>}

          <button
            onClick={guardar}
            disabled={enviando}
            className="w-full rounded-xl bg-blue-700 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {enviando ? "Guardando..." : "Guardar PIN"}
          </button>
        </div>
      </div>
    </main>
  );
}
