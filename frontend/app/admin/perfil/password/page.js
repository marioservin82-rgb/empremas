"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";

export default function AdminCambiarPassword() {
  const router = useRouter();
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
    }
  }, [router]);

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setExito(false);
    if (passwordNueva.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (passwordNueva !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setGuardando(true);
    try {
      await adminFetch("/api/admin/mi-password", {
        method: "PATCH",
        body: JSON.stringify({ passwordActual, passwordNueva }),
      });
      setPasswordActual("");
      setPasswordNueva("");
      setConfirmar("");
      setExito(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/admin" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Cambiar contraseña</h1>
        </div>

        <form onSubmit={guardar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Contraseña actual</label>
          <input
            type="password"
            required
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            className={campo}
          />

          <label className={etiqueta}>Contraseña nueva</label>
          <input
            type="password"
            required
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            className={campo}
          />

          <label className={etiqueta}>Confirmar contraseña nueva</label>
          <input
            type="password"
            required
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className={campo}
          />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Contraseña actualizada.
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-slate-800 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </div>
    </main>
  );
}
