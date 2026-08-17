"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Registro() {
  const router = useRouter();
  const [form, setForm] = useState({
    razonSocial: "",
    ruc: "",
    nombreDueno: "",
    email: "",
    telefono: "",
    password: "",
  });
  const [metodoContacto, setMetodoContacto] = useState("telefono");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  function actualizar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/auth/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razonSocial: form.razonSocial,
          ruc: form.ruc,
          nombreDueno: form.nombreDueno,
          password: form.password,
          email: metodoContacto === "email" ? form.email : undefined,
          telefono: metodoContacto === "telefono" ? form.telefono : undefined,
        }),
      });
      const datos = await resp.json();
      if (!resp.ok) throw new Error(datos.error || "No se pudo registrar la empresa");
      localStorage.setItem("empremas_token", datos.token);
      router.push("/panel");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-navy">
            Registrá tu empresa
          </h1>
          <p className="mt-2 text-slate-500">30 días de prueba gratis</p>
        </div>

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Nombre de tu empresa</label>
          <input required value={form.razonSocial} onChange={actualizar("razonSocial")} className={campo} placeholder="Ferretería Don Ramón" />

          <label className={etiqueta}>RUC</label>
          <input required value={form.ruc} onChange={actualizar("ruc")} className={campo} placeholder="1234567-8" />

          <label className={etiqueta}>Tu nombre</label>
          <input required value={form.nombreDueno} onChange={actualizar("nombreDueno")} className={campo} placeholder="Nombre y apellido" />

          <p className={etiqueta}>Registrarme con</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMetodoContacto("telefono")}
              className={`rounded-xl py-2 text-sm font-semibold transition ${
                metodoContacto === "telefono" ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Teléfono
            </button>
            <button
              type="button"
              onClick={() => setMetodoContacto("email")}
              className={`rounded-xl py-2 text-sm font-semibold transition ${
                metodoContacto === "email" ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Email
            </button>
          </div>

          {metodoContacto === "telefono" ? (
            <>
              <label className={etiqueta}>Teléfono</label>
              <input
                type="tel"
                required
                value={form.telefono}
                onChange={actualizar("telefono")}
                className={campo}
                placeholder="0981 234 567"
              />
            </>
          ) : (
            <>
              <label className={etiqueta}>Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={actualizar("email")}
                className={campo}
                placeholder="tu@email.com"
              />
            </>
          )}

          <label className={etiqueta}>Contraseña</label>
          <input type="password" required value={form.password} onChange={actualizar("password")} className={campo} placeholder="••••••••" />

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {cargando ? "Creando..." : "Crear mi cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-slate-500">
          ¿Ya tenés cuenta?{" "}
          <Link href="/" className="font-semibold text-navy">
            Entrá acá
          </Link>
        </p>
      </div>
    </main>
  );
}
