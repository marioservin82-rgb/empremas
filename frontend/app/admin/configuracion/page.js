"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";

export default function AdminConfiguracion() {
  const router = useRouter();
  const [whatsappSoporte, setWhatsappSoporte] = useState("");
  const [umbralAlertaContador, setUmbralAlertaContador] = useState("");
  const [datosPago, setDatosPago] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
      return;
    }
    adminFetch("/api/admin/configuracion")
      .then((c) => {
        setWhatsappSoporte(c.whatsappSoporte || "");
        setUmbralAlertaContador(c.umbralAlertaContador ?? 15);
        setDatosPago(c.datosPago || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [router]);

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setExito(false);
    setGuardando(true);
    try {
      const actualizado = await adminFetch("/api/admin/configuracion", {
        method: "PATCH",
        body: JSON.stringify({
          whatsappSoporte: whatsappSoporte || null,
          umbralAlertaContador: Number(umbralAlertaContador) || 15,
          datosPago: datosPago || null,
        }),
      });
      setWhatsappSoporte(actualizado.whatsappSoporte || "");
      setUmbralAlertaContador(actualizado.umbralAlertaContador ?? 15);
      setDatosPago(actualizado.datosPago || "");
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
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Configuración de soporte</h1>
          <p className="mt-1 text-sm text-slate-500">
            Este número lo ven todos los comercios que usan EMPREMAS (botón flotante de WhatsApp y pantalla de Ayuda).
          </p>
        </div>

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <form onSubmit={guardar} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <label className={etiqueta}>WhatsApp de soporte</label>
            <input
              type="tel"
              value={whatsappSoporte}
              onChange={(e) => setWhatsappSoporte(e.target.value)}
              className={campo}
              placeholder="0981234567"
            />

            <label className={etiqueta}>Umbral de clientes para alertar facturación formal (contadores aliados)</label>
            <input
              type="number"
              min="1"
              value={umbralAlertaContador}
              onChange={(e) => setUmbralAlertaContador(e.target.value)}
              className={campo}
            />
            <p className="-mt-3 mb-4 text-xs text-slate-400">
              Cuando un contador aliado acumula esta cantidad de clientes activos referidos, aparece una alerta en su
              ficha sugiriendo pedirle que empiece a facturar su comisión de forma formal.
            </p>

            <label className={etiqueta}>Datos para el cobro de la mensualidad</label>
            <textarea
              value={datosPago}
              onChange={(e) => setDatosPago(e.target.value)}
              rows={4}
              className={campo}
              placeholder={"Banco Itaú · Cta. cte. 123456 · Mario Servín · CI 1234567\nTigo Money: 0981 234 567"}
            />
            <p className="-mt-3 mb-4 text-xs text-slate-400">
              Se incluye en el mensaje de WhatsApp que le mandás a una empresa cuando su plan está por vencer.
            </p>

            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {exito && (
              <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="w-full rounded-xl bg-slate-800 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
