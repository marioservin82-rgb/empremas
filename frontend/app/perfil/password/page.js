"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function MiPassword() {
  const router = useRouter();
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
    }
  }, [router]);

  async function guardar() {
    setError("");
    setExito(false);
    if (passwordNueva.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (passwordNueva !== confirmarPassword) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    setEnviando(true);
    try {
      await apiFetch("/api/usuarios/mi-password", {
        method: "PATCH",
        body: JSON.stringify({ passwordActual, passwordNueva }),
      });
      setExito(true);
      setPasswordActual("");
      setPasswordNueva("");
      setConfirmarPassword("");
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
          <h1 className="text-2xl font-bold text-navy">Mi contraseña</h1>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <label className="mb-1 block text-sm font-medium text-slate-500">Contraseña actual</label>
          <input
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          <label className="mb-1 block text-sm font-medium text-slate-500">Contraseña nueva</label>
          <input
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="Al menos 6 caracteres"
            className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          <label className="mb-1 block text-sm font-medium text-slate-500">Confirmar contraseña nueva</label>
          <input
            value={confirmarPassword}
            onChange={(e) => setConfirmarPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Contraseña actualizada.</p>}

          <button
            onClick={guardar}
            disabled={enviando}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {enviando ? "Guardando..." : "Guardar contraseña"}
          </button>
        </div>
      </div>
    </main>
  );
}
