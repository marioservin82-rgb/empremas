"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function etiquetaPeriodo(periodo) {
  const [anio, mes] = periodo.slice(0, 7).split("-");
  const nombre = new Date(Number(anio), Number(mes) - 1, 1).toLocaleDateString("es-PY", {
    month: "long",
    year: "numeric",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

export default function DetalleVendedor() {
  const router = useRouter();
  const { id } = useParams();

  const [periodo, setPeriodo] = useState(mesActual());
  const [comisiones, setComisiones] = useState(null);
  const [error, setError] = useState("");
  const [marcando, setMarcando] = useState(false);

  function cargarComisiones(p) {
    return apiFetch(`/api/vendedores/${id}/comisiones?periodo=${p}`).then(setComisiones);
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    cargarComisiones(periodo).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  async function alternarPagado() {
    setMarcando(true);
    setError("");
    try {
      await apiFetch(`/api/vendedores/${id}/comisiones/marcar-pagado`, {
        method: "POST",
        body: JSON.stringify({ periodo, pagado: !comisiones.pagado }),
      });
      await cargarComisiones(periodo);
    } catch (err) {
      setError(err.message);
    } finally {
      setMarcando(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/vendedores/lista" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">{comisiones?.vendedorNombre || "Vendedor"}</h1>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Comisión de {etiquetaPeriodo(periodo)}</h2>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600"
            />
          </div>

          {!comisiones ? (
            <p className="text-slate-500">Cargando...</p>
          ) : comisiones.items.length === 0 ? (
            <p className="text-slate-500">Sin ventas con comisión en este período.</p>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-slate-100">
                {comisiones.items.map((it, indice) => (
                  <div key={indice} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">
                        {it.cantidad} × {it.producto_nombre}
                      </p>
                      <p className="text-slate-400">
                        {new Date(it.creado_en).toLocaleDateString("es-PY")}
                        {!it.realizada && " · a crédito, sin cobrar todavía"}
                      </p>
                    </div>
                    <p className={`font-semibold ${it.realizada ? "text-navy" : "text-slate-400"}`}>
                      Gs {formatoGs.format(it.comision_monto)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <p className="text-sm text-slate-500">Generado este mes</p>
                <p className="font-semibold text-slate-600">Gs {formatoGs.format(comisiones.totalGenerado)}</p>
              </div>
              {comisiones.totalPendienteCobro > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Gs {formatoGs.format(comisiones.totalPendienteCobro)} todavía sin cobrar al cliente — se suma abajo
                  cuando se cobre.
                </p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <p className="text-lg font-bold text-slate-800">Cobrable ahora</p>
                <p className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(comisiones.totalRealizado)}</p>
              </div>

              <button
                onClick={alternarPagado}
                disabled={marcando}
                className={`mt-4 w-full rounded-xl py-3 font-semibold text-white transition disabled:opacity-60 ${
                  comisiones.pagado ? "bg-slate-500 hover:bg-slate-600" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {comisiones.pagado ? "Marcar como pendiente" : "Marcar como pagado"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
