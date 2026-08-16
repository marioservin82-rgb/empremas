"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function NuevoEmpleado() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("cajero");
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    apiFetch("/api/empresas/actual")
      .then((e) => {
        if (e.limite_sucursales > 1) {
          apiFetch("/api/sucursales").then(setSucursales).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await apiFetch("/api/usuarios", {
        method: "POST",
        body: JSON.stringify({ nombre, email, password, rol, sucursalId: sucursalId || undefined }),
      });
      router.push("/empleados");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/empleados" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Nuevo empleado</h1>
        </div>

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Nombre</label>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} placeholder="Nombre completo" />

          <label className={etiqueta}>Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} placeholder="empleado@ejemplo.com" />

          <label className={etiqueta}>Contraseña inicial</label>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={campo} placeholder="Al menos 6 caracteres" />

          <label className={etiqueta}>Rol</label>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {[
              { valor: "cajero", etiqueta: "Cajero" },
              { valor: "encargado", etiqueta: "Encargado" },
            ].map((r) => (
              <button
                key={r.valor}
                type="button"
                onClick={() => setRol(r.valor)}
                className={`rounded-xl py-3 font-semibold transition ${
                  rol === r.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r.etiqueta}
              </button>
            ))}
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Encargado puede hacer casi todo lo que vos, incluido autorizar anulaciones con PIN. Cajero solo vende,
            cobra y cotiza.
          </p>

          {sucursales.length > 0 && (
            <>
              <label className={etiqueta}>Sucursal</label>
              <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className={campo}>
                <option value="">La primera de la empresa</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </>
          )}

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Crear empleado"}
          </button>
        </form>
      </div>
    </main>
  );
}
