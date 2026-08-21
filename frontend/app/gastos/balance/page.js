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

function mesActual(offsetMeses = 0) {
  const d = new Date();
  const fecha = new Date(d.getFullYear(), d.getMonth() + offsetMeses, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

function primerDiaDelMes(offsetMeses = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offsetMeses, 1).toISOString().slice(0, 10);
}

function ultimoDiaDelMes(offsetMeses = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offsetMeses + 1, 0).toISOString().slice(0, 10);
}

const ETIQUETA_PERIODO = {
  este_mes: "Este mes",
  mes_pasado: "El mes pasado",
  rango: "En este período",
};

export default function BalanceMensual() {
  const router = useRouter();
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(ultimoDiaDelMes());
  const [periodoActivo, setPeriodoActivo] = useState("este_mes");
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (query) => {
    setCargando(true);
    setError("");
    try {
      setBalance(await apiFetch(`/api/gastos/balance?${query}`));
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
    cargar(`mes=${mesActual()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function elegirMes(nombre, offsetMeses) {
    setPeriodoActivo(nombre);
    setDesde(primerDiaDelMes(offsetMeses));
    setHasta(ultimoDiaDelMes(offsetMeses));
    cargar(`mes=${mesActual(offsetMeses)}`);
  }

  function consultarRango() {
    setPeriodoActivo("rango");
    cargar(`desde=${desde}&hasta=${hasta}`);
  }

  const gano = balance && Number(balance.resultadoOperativo) >= 0;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="py-6">
          <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Balance del mes</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-2 text-sm font-medium text-slate-500">Período</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[
              { valor: "este_mes", etiqueta: "Este mes", offset: 0 },
              { valor: "mes_pasado", etiqueta: "Mes pasado", offset: -1 },
            ].map((p) => (
              <button
                key={p.valor}
                onClick={() => elegirMes(p.valor, p.offset)}
                className={`rounded-xl py-2 font-semibold transition ${
                  periodoActivo === p.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <button
              onClick={consultarRango}
              className="rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-light"
            >
              Consultar
            </button>
          </div>
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
                  {ETIQUETA_PERIODO[periodoActivo] || "En este período"} {gano ? "ganaste" : "perdiste"}
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
                  <span className="text-slate-500">Costo de mercadería vendida (a costo promedio)</span>
                  <span className="font-semibold text-red-600">− Gs {formatoGs.format(balance.costoMercaderiaVendida)}</span>
                </div>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-slate-500">Consumo interno (a costo)</span>
                  <span className="font-semibold text-red-600">− Gs {formatoGs.format(balance.consumoInterno)}</span>
                </div>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-slate-500">Merma (a costo)</span>
                  <span className="font-semibold text-red-600">− Gs {formatoGs.format(balance.merma)}</span>
                </div>
                {balance.retirosOperativos > 0 && (
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Retiros de caja (pago a proveedor / gasto puntual)</span>
                    <span className="font-semibold text-red-600">− Gs {formatoGs.format(balance.retirosOperativos)}</span>
                  </div>
                )}

                <div className="my-2 border-t border-slate-200" />
                <div className="flex justify-between py-1 font-bold">
                  <span>Resultado operativo</span>
                  <span className={gano ? "text-emerald-700" : "text-red-700"}>
                    Gs {formatoGs.format(balance.resultadoOperativo)}
                  </span>
                </div>
              </div>

              {(balance.inversionEquipos > 0 || balance.retirosPersonales > 0 || balance.prestamos.length > 0) && (
                <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5">
                  <h2 className="mb-3 font-bold text-slate-600">
                    Aparte — no afecta el resultado operativo
                  </h2>

                  {balance.inversionEquipos > 0 && (
                    <div className="flex justify-between py-1 text-sm">
                      <span className="text-slate-500">Inversión en equipos en el período</span>
                      <span className="font-semibold text-slate-700">Gs {formatoGs.format(balance.inversionEquipos)}</span>
                    </div>
                  )}

                  {balance.retirosPersonales > 0 && (
                    <div className="flex justify-between py-1 text-sm">
                      <span className="text-slate-500">Retiros del dueño en el período</span>
                      <span className="font-semibold text-slate-700">Gs {formatoGs.format(balance.retirosPersonales)}</span>
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

              {balance.retirosARevisar > 0 && (
                <div className="mt-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-5">
                  <h2 className="mb-1 font-bold text-amber-800">A revisar</h2>
                  <p className="mb-3 text-xs text-amber-700">
                    Retiros de caja por "Envío con un tercero" u "Otro" — no se sabe si corresponden a un gasto del
                    negocio, así que no se contaron en el resultado operativo. Revisalos a mano.
                  </p>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-amber-700">Retiros sin clasificar</span>
                    <span className="font-semibold text-amber-800">Gs {formatoGs.format(balance.retirosARevisar)}</span>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>
    </main>
  );
}
