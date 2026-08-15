"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const ETIQUETA_CATEGORIA = {
  servicios_fijos: "Servicios fijos",
  software_suscripciones: "Software y suscripciones",
  personal: "Personal",
  vehiculo_transporte: "Vehículo / Transporte",
  equipos_inversion: "Equipos e inversión",
  otros: "Otros gastos",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function etiquetaMes(mes) {
  const [anio, mesNum] = mes.split("-").map(Number);
  return `${MESES[mesNum - 1]} ${anio}`;
}

function sumarMes(mes, delta) {
  const [anio, mesNum] = mes.split("-").map(Number);
  const fecha = new Date(anio, mesNum - 1 + delta, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

export default function BalanceMensual() {
  const router = useRouter();
  const [mes, setMes] = useState(mesActual());
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (mesElegido) => {
    setCargando(true);
    setError("");
    try {
      setBalance(await apiFetch(`/api/gastos/balance?mes=${mesElegido}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar(mes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function cambiarMes(delta) {
    const nuevoMes = sumarMes(mes, delta);
    setMes(nuevoMes);
    cargar(nuevoMes);
  }

  const gano = balance && Number(balance.resultadoOperativo) >= 0;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="py-6">
          <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Balance del mes</h1>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-3 shadow shadow-slate-200">
          <button onClick={() => cambiarMes(-1)} className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100">
            ←
          </button>
          <p className="font-semibold text-slate-700">{etiquetaMes(mes)}</p>
          <button onClick={() => cambiarMes(1)} className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100">
            →
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-center text-slate-500">Calculando...</p>
        ) : (
          balance && (
            <>
              <div
                className={`mb-6 rounded-2xl p-6 text-center shadow-lg ${
                  gano ? "bg-emerald-600" : "bg-red-600"
                }`}
              >
                <p className="text-sm font-semibold text-white/80">
                  {gano ? "Este mes ganaste" : "Este mes perdiste"}
                </p>
                <p className="mt-1 text-4xl font-extrabold text-white">
                  Gs {formatoGs.format(Math.abs(balance.resultadoOperativo))}
                </p>
              </div>

              <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <h2 className="mb-3 font-bold text-slate-800">Detalle</h2>

                <div className="flex justify-between py-1 text-sm">
                  <span className="text-slate-500">Ingresos (ventas + cobros)</span>
                  <span className="font-semibold text-emerald-700">Gs {formatoGs.format(balance.ingresos)}</span>
                </div>

                {Object.entries(balance.gastosPorCategoria)
                  .filter(([categoria]) => categoria !== "equipos_inversion")
                  .map(([categoria, monto]) => (
                    <div key={categoria} className="flex justify-between py-1 text-sm">
                      <span className="text-slate-500">{ETIQUETA_CATEGORIA[categoria]}</span>
                      <span className="font-semibold text-red-600">− Gs {formatoGs.format(monto)}</span>
                    </div>
                  ))}

                <div className="flex justify-between py-1 text-sm">
                  <span className="text-slate-500">Mercadería repuesta (pagos a proveedores)</span>
                  <span className="font-semibold text-red-600">− Gs {formatoGs.format(balance.mercaderia)}</span>
                </div>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-slate-500">Consumo interno (a costo)</span>
                  <span className="font-semibold text-red-600">− Gs {formatoGs.format(balance.consumoInterno)}</span>
                </div>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-slate-500">Merma (a costo)</span>
                  <span className="font-semibold text-red-600">− Gs {formatoGs.format(balance.merma)}</span>
                </div>

                <div className="my-2 border-t border-slate-200" />
                <div className="flex justify-between py-1 font-bold">
                  <span>Resultado operativo</span>
                  <span className={gano ? "text-emerald-700" : "text-red-700"}>
                    Gs {formatoGs.format(balance.resultadoOperativo)}
                  </span>
                </div>
              </div>

              {(balance.inversionEquipos > 0 || balance.prestamos.length > 0) && (
                <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5">
                  <h2 className="mb-3 font-bold text-slate-600">
                    Aparte — no afecta el resultado operativo
                  </h2>

                  {balance.inversionEquipos > 0 && (
                    <div className="flex justify-between py-1 text-sm">
                      <span className="text-slate-500">Inversión en equipos este mes</span>
                      <span className="font-semibold text-slate-700">Gs {formatoGs.format(balance.inversionEquipos)}</span>
                    </div>
                  )}

                  {balance.prestamos.map((p) => (
                    <div key={p.id} className="mt-2 rounded-xl bg-white p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Saldo pendiente</span>
                        <span className="font-semibold text-slate-700">Gs {formatoGs.format(p.saldo_pendiente)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Cuota mensual</span>
                        <span className="font-semibold text-slate-700">Gs {formatoGs.format(p.cuota_mensual)}</span>
                      </div>
                      {p.proximo_vencimiento && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Próximo vencimiento</span>
                          <span className="font-semibold text-slate-700">
                            {new Date(`${p.proximo_vencimiento.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY")}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        )}
      </div>
    </main>
  );
}
