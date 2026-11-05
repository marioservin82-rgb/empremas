"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

// Fecha "de hoy" en Paraguay como YYYY-MM-DD (sin correrse por la zona horaria).
function hoyPY() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}
function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function fecha(f) {
  return new Date(`${String(f).slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY");
}

const campo =
  "rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

export default function MovimientosCuentas() {
  const router = useRouter();
  const [desde, setDesde] = useState(hoyPY());
  const [hasta, setHasta] = useState(hoyPY());
  const [cuentaId, setCuentaId] = useState("");
  const [cuentas, setCuentas] = useState([]);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  const cargar = useCallback(
    (d, h, c) => {
      setError("");
      const q = new URLSearchParams({ desde: d, hasta: h });
      if (c) q.set("cuentaId", c);
      apiFetch(`/api/cuentas/movimientos?${q.toString()}`)
        .then(setDatos)
        .catch((err) => setError(err.message));
    },
    []
  );

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        if (u.rol !== "dueno" && u.rol !== "encargado") router.push("/panel");
      })
      .catch(() => {});
    apiFetch("/api/cuentas")
      .then((d) => setCuentas(d.cuentas))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    cargar(desde, hasta, cuentaId);
  }, [desde, hasta, cuentaId, cargar]);

  function periodo(tipo) {
    const hoy = hoyPY();
    if (tipo === "hoy") {
      setDesde(hoy);
      setHasta(hoy);
    } else if (tipo === "ayer") {
      const ayer = sumarDias(hoy, -1);
      setDesde(ayer);
      setHasta(ayer);
    } else {
      setDesde(`${hoy.slice(0, 8)}01`);
      setHasta(hoy);
    }
  }

  const totalEntro = datos ? datos.totales.reduce((a, t) => a + t.entro, 0) : 0;
  const totalSalio = datos ? datos.totales.reduce((a, t) => a + t.salio, 0) : 0;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6 print:hidden">
          <div className="flex items-center gap-3">
            <Link href="/panel" className="text-sm font-semibold text-slate-400 hover:text-navy">
              ← Panel
            </Link>
            <h1 className="text-2xl font-bold text-navy">📒 Movimientos por cuenta</h1>
          </div>
          <Link href="/cuentas" className="text-sm font-semibold text-navy hover:text-brand">
            Cuentas
          </Link>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-4 shadow shadow-slate-200 print:hidden">
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              ["hoy", "Hoy"],
              ["ayer", "Ayer"],
              ["mes", "Este mes"],
            ].map(([v, t]) => (
              <button
                key={v}
                onClick={() => periodo(v)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-500">
              Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
            </label>
            <label className="text-sm text-slate-500">
              Hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
            </label>
            <label className="text-sm text-slate-500">
              Cuenta{" "}
              <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={campo}>
                <option value="">Todas</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value="sin">Sin cuenta asignada</option>
              </select>
            </label>
            <button onClick={() => window.print()} className="ml-auto rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light">
              Imprimir
            </button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

        {datos && (
          <div className="reporte-imprimible rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <style>{"@page { size: A4; margin: 15mm; }"}</style>
            <p className="text-lg font-bold text-slate-800">Movimientos por transferencia</p>
            <p className="mb-4 text-sm text-slate-500">
              {fecha(datos.desde)} – {fecha(datos.hasta)}
            </p>

            {datos.totales.length === 0 ? (
              <p className="py-4 text-sm text-slate-400">No hubo transferencias en este período.</p>
            ) : (
              <>
                <table className="mb-5 w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1.5">Cuenta</th>
                      <th className="text-right">Entró</th>
                      <th className="text-right">Salió</th>
                      <th className="text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.totales.map((t) => (
                      <tr key={t.cuentaId || "sin"} className="border-b border-slate-100">
                        <td className="py-1.5 font-semibold">{t.nombre}</td>
                        <td className="text-right text-emerald-700">Gs {formatoGs.format(t.entro)}</td>
                        <td className="text-right text-red-600">Gs {formatoGs.format(t.salio)}</td>
                        <td className="text-right font-bold">Gs {formatoGs.format(t.neto)}</td>
                      </tr>
                    ))}
                    {datos.totales.length > 1 && (
                      <tr className="font-bold">
                        <td className="pt-2">Total</td>
                        <td className="pt-2 text-right">Gs {formatoGs.format(totalEntro)}</td>
                        <td className="pt-2 text-right">Gs {formatoGs.format(totalSalio)}</td>
                        <td className="pt-2 text-right">Gs {formatoGs.format(totalEntro - totalSalio)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1.5">Fecha</th>
                      <th>Concepto</th>
                      <th>Cuenta</th>
                      <th>N° op.</th>
                      <th className="text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.movimientos.map((m, i) => (
                      <tr key={i} className="border-b border-slate-100 align-top">
                        <td className="py-1 pr-2 whitespace-nowrap">{fecha(m.fecha)}</td>
                        <td className="pr-2">{m.concepto}</td>
                        <td className="pr-2">{m.cuentaNombre || <span className="text-slate-400">sin cuenta</span>}</td>
                        <td className="pr-2 text-slate-500">{m.nroOperacion || "—"}</td>
                        <td className={`text-right font-semibold whitespace-nowrap ${m.sentido === "entrada" ? "text-emerald-700" : "text-red-600"}`}>
                          {m.sentido === "entrada" ? "+" : "−"} Gs {formatoGs.format(m.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
