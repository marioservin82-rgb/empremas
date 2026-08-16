"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

function fecha(f) {
  if (!f) return null;
  return new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY");
}

export default function Prestamos() {
  const router = useRouter();
  const [montoRecibido, setMontoRecibido] = useState("");
  const [cuotaMensual, setCuotaMensual] = useState("");
  const [tasaInteres, setTasaInteres] = useState("");
  const [proximoVencimiento, setProximoVencimiento] = useState("");
  const [prestamos, setPrestamos] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [pagando, setPagando] = useState(null);

  function cargar() {
    apiFetch("/api/gastos/prestamos")
      .then(setPrestamos)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await apiFetch("/api/gastos/prestamos", {
        method: "POST",
        body: JSON.stringify({
          montoRecibido: Number(montoRecibido),
          cuotaMensual: Number(cuotaMensual),
          tasaInteres: tasaInteres ? Number(tasaInteres) : undefined,
          proximoVencimiento: proximoVencimiento || undefined,
        }),
      });
      setMontoRecibido("");
      setCuotaMensual("");
      setTasaInteres("");
      setProximoVencimiento("");
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function pagarCuota(id) {
    setPagando(id);
    setError("");
    try {
      await apiFetch(`/api/gastos/prestamos/${id}/pagar-cuota`, { method: "POST", body: JSON.stringify({}) });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setPagando(null);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="py-6">
          <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Préstamos</h1>
          <p className="mt-1 text-sm text-slate-500">Informativo — no afecta el resultado operativo del balance.</p>
        </div>

        <form onSubmit={guardar} className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <label className={etiqueta}>Monto recibido (Gs)</label>
          <input required type="number" min="1" value={montoRecibido} onChange={(e) => setMontoRecibido(e.target.value)} className={campo} placeholder="0" />

          <label className={etiqueta}>Cuota mensual (Gs)</label>
          <input required type="number" min="1" value={cuotaMensual} onChange={(e) => setCuotaMensual(e.target.value)} className={campo} placeholder="0" />

          <label className={etiqueta}>Tasa de interés % (opcional)</label>
          <input type="number" min="0" step="0.01" value={tasaInteres} onChange={(e) => setTasaInteres(e.target.value)} className={campo} placeholder="0" />

          <label className={etiqueta}>Próximo vencimiento de cuota</label>
          <input type="date" value={proximoVencimiento} onChange={(e) => setProximoVencimiento(e.target.value)} className={campo} />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-slate-800 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar préstamo"}
          </button>
        </form>

        <h2 className="mb-2 text-sm font-medium text-slate-500">Préstamos activos</h2>
        {prestamos.length === 0 ? (
          <p className="text-slate-400">Todavía no hay préstamos cargados.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {prestamos.map((p) => (
              <div key={p.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="mb-2 flex justify-between">
                  <span className="text-sm text-slate-400">Saldo pendiente</span>
                  <span className="text-xl font-extrabold text-navy">Gs {formatoGs.format(p.saldo_pendiente)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Cuota mensual</span>
                  <span className="font-semibold text-slate-700">Gs {formatoGs.format(p.cuota_mensual)}</span>
                </div>
                {p.proximo_vencimiento && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Próximo vencimiento</span>
                    <span className="font-semibold text-slate-700">{fecha(p.proximo_vencimiento)}</span>
                  </div>
                )}
                <button
                  onClick={() => pagarCuota(p.id)}
                  disabled={pagando === p.id || Number(p.saldo_pendiente) <= 0}
                  className="mt-3 w-full rounded-xl bg-brand py-2 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
                >
                  {Number(p.saldo_pendiente) <= 0
                    ? "Saldado"
                    : pagando === p.id
                    ? "Registrando..."
                    : "Registrar pago de cuota"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
