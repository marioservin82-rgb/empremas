"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");
const ESTILO = {
  pendiente: "bg-amber-100 text-amber-700",
  enviado: "bg-amber-100 text-amber-700",
  aprobado: "bg-emerald-100 text-emerald-700",
  rechazado: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};
const ETIQUETA = { pendiente: "Enviando…", enviado: "En trámite", aprobado: "Aprobada", rechazado: "Rechazada", error: "Error de envío" };
const MOTIVOS = {
  1: "Devolución y ajuste de precios",
  2: "Devolución",
  3: "Descuento",
  4: "Bonificación",
  5: "Crédito incobrable",
  6: "Recupero de costo",
  7: "Recupero de gasto",
  8: "Ajuste de precio",
};

export default function DetalleNota() {
  const router = useRouter();
  const { id } = useParams();
  const [n, setN] = useState(null);
  const [error, setError] = useState("");
  const [reintentando, setReintentando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const tries = useRef(0);

  const cargar = useCallback(() => apiFetch(`/api/notas/${id}`).then(setN), [id]);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    let cancelado = false;
    async function tick() {
      try {
        const d = await apiFetch(`/api/notas/${id}`);
        if (cancelado) return;
        setN(d);
        tries.current += 1;
        const listo = !!d.cdc || ["rechazado", "error"].includes(d.estado);
        if (!listo && tries.current < 20) setTimeout(tick, 3000);
      } catch (e) {
        if (!cancelado) setError(e.message);
      }
    }
    tick();
    return () => {
      cancelado = true;
    };
  }, [id, router]);

  async function reintentar() {
    setReintentando(true);
    setError("");
    try {
      setN(await apiFetch(`/api/notas/${id}/reintentar`, { method: "POST" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setReintentando(false);
    }
  }

  async function descargar() {
    setDescargando(true);
    setError("");
    try {
      const token = localStorage.getItem("empremas_token");
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/notas/${id}/kude`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!resp.ok) throw new Error("No se pudo descargar el KUDE");
      window.open(URL.createObjectURL(await resp.blob()), "_blank");
    } catch (e) {
      setError(e.message);
    } finally {
      setDescargando(false);
    }
  }

  if (error && !n) return <main className="p-6 text-sm text-red-600">{error}</main>;
  if (!n) return <main className="p-6 text-slate-500">Cargando…</main>;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="py-6">
          <Link href="/documentos/notas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">
            {n.tipo === "credito" ? "Nota de Crédito" : "Nota de Débito"} {n.numero_formateado || ""}
          </h1>
          <p className="text-sm text-slate-400">
            {n.cliente_nombre || "Consumidor Final"} · sobre factura N° ticket {n.numero_ticket}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
              ESTILO[n.estado] || "bg-slate-100 text-slate-500"
            }`}
          >
            {ETIQUETA[n.estado] || n.estado}
          </span>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {(n.estado === "rechazado" || n.estado === "error") && n.mensaje_error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{n.mensaje_error}</p>
        )}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <div className="flex justify-between">
            <span className="text-sm text-slate-400">Total</span>
            <span className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(n.total)}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Motivo: {MOTIVOS[n.motivo] || n.motivo}
            {n.reingresa_stock ? " · el stock volvió a entrar" : ""}
          </p>
          {n.observacion && <p className="mt-1 text-sm text-slate-500">{n.observacion}</p>}
          <div className="mt-3 flex flex-col divide-y divide-slate-100">
            {n.items.map((it) => (
              <div key={it.id} className="flex justify-between py-2 text-sm">
                <span className="text-slate-700">
                  {Number(it.cantidad).toLocaleString("es-PY")} × {it.producto_nombre}
                </span>
                <span className="font-semibold text-slate-800">Gs {formatoGs.format(it.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {n.estado === "aprobado" && (
            <button
              onClick={descargar}
              disabled={descargando}
              className="rounded-xl bg-navy py-3 font-semibold text-white hover:bg-navy-2 disabled:opacity-60"
            >
              {descargando ? "Descargando…" : "Descargar KUDE (PDF)"}
            </button>
          )}
          {["error", "rechazado", "enviado", "pendiente"].includes(n.estado) && (
            <button
              onClick={reintentar}
              disabled={reintentando}
              className="rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
            >
              {reintentando ? "Consultando…" : n.estado === "enviado" || n.estado === "pendiente" ? "Ver estado" : "Reintentar"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
