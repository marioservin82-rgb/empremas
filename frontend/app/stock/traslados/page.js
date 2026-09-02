"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_ESTADO = {
  pendiente: { texto: "⏳ En camino", clase: "bg-amber-100 text-amber-700" },
  confirmado: { texto: "✓ Confirmado", clase: "bg-emerald-100 text-emerald-700" },
  cancelado: { texto: "✕ Cancelado", clase: "bg-slate-100 text-slate-500" },
};

function fechaHora(f) {
  return `${new Date(f).toLocaleDateString("es-PY")} ${new Date(f).toLocaleTimeString("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function Traslados() {
  const router = useRouter();
  const [pendientes, setPendientes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [vista, setVista] = useState("pendientes");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(null);

  function cargar() {
    setCargando(true);
    setError("");
    Promise.all([apiFetch("/api/traslados/pendientes"), apiFetch("/api/traslados")])
      .then(([p, h]) => {
        setPendientes(p);
        setHistorial(h);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function confirmar(id) {
    setError("");
    setConfirmando(id);
    try {
      await apiFetch(`/api/traslados/${id}/confirmar`, { method: "POST" });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmando(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a Stock
          </Link>
          <h1 className="text-2xl font-bold text-navy">Traslados</h1>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setVista("pendientes")}
            className={`rounded-xl px-5 py-2 font-semibold transition ${
              vista === "pendientes" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Por confirmar {pendientes.length > 0 && `(${pendientes.length})`}
          </button>
          <button
            onClick={() => setVista("historial")}
            className={`rounded-xl px-5 py-2 font-semibold transition ${
              vista === "historial" ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Historial
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : vista === "pendientes" ? (
          pendientes.length === 0 ? (
            <p className="text-slate-500">No hay traslados esperando confirmación acá.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pendientes.map((t) => (
                <div key={t.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <p className="font-bold text-navy">Traslado N° {t.numero}</p>
                      <p className="text-xs text-slate-400">
                        Desde {t.sucursal_origen_nombre} · {fechaHora(t.creado_en)}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                      ⏳ En camino
                    </span>
                  </div>
                  <div className="mb-4 flex flex-col divide-y divide-slate-100 border-t border-slate-100 pt-2">
                    {t.items.map((i) => (
                      <div key={i.producto_id} className="flex justify-between py-1.5 text-sm">
                        <span>{i.producto_nombre}</span>
                        <span className="font-semibold">×{formatoGs.format(i.cantidad)}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => confirmar(t.id)}
                    disabled={confirmando === t.id}
                    className="w-full rounded-xl bg-semaforo-ok py-4 text-lg font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {confirmando === t.id ? "Confirmando..." : "✅ Confirmar entrada"}
                  </button>
                </div>
              ))}
            </div>
          )
        ) : historial.length === 0 ? (
          <p className="text-slate-500">Sin traslados registrados todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {historial.map((t) => {
              const estilo = ETIQUETA_ESTADO[t.estado];
              return (
                <div key={t.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-navy">Traslado N° {t.numero}</p>
                      <p className="text-xs text-slate-400">
                        {t.sucursal_origen_nombre} → {t.sucursal_destino_nombre} · {fechaHora(t.creado_en)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${estilo.clase}`}>{estilo.texto}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
