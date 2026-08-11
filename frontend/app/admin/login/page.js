"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const resp = await fetch("http://localhost:3001/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const datos = await resp.json();
      if (!resp.ok) throw new Error(datos.error || "No se pudo iniciar sesión");
      localStorage.setItem("empremas_admin_token", datos.token);
      router.push("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-slate-900">EMPREMAS</h1>
          <p className="mt-2 text-slate-500">Panel de administración de la plataforma</p>
        </div>

        <form
          onSubmit={enviar}
          className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200"
        >
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100"
            placeholder="admin@empremas.com"
          />

          <label className="mb-1 block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100"
            placeholder="••••••••"
          />

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-xl bg-slate-800 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            {cargando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
