"use client";

import { useEffect, useRef, useState } from "react";
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

export default function DetalleAutofactura() {
  const router = useRouter();
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [error, setError] = useState("");
  const [reintentando, setReintentando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const tries = useRef(0);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    let cancelado = false;
    async function tick() {
      try {
        const d = await apiFetch(`/api/autofacturas/${id}`);
        if (cancelado) return;
        setA(d);
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
      setA(await apiFetch(`/api/autofacturas/${id}/reintentar`, { method: "POST" }));
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
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/autofacturas/${id}/kude`,
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

  if (error && !a) return <main className="p-6 text-sm text-red-600">{error}</main>;
  if (!a) return <main className="p-6 text-slate-500">Cargando…</main>;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="py-6">
          <Link href="/documentos/autofactura" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Autofactura {a.numero_formateado || ""}</h1>
          <p className="text-sm text-slate-400">
            {a.vendedor_nombre} · {new Date(a.creado_en).toLocaleDateString("es-PY")}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
              ESTILO[a.estado] || "bg-slate-100 text-slate-500"
            }`}
          >
            {ETIQUETA[a.estado] || a.estado}
          </span>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {(a.estado === "rechazado" || a.estado === "error") && a.mensaje_error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{a.mensaje_error}</p>
        )}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <div className="flex justify-between">
            <span className="text-sm text-slate-400">Total (sin IVA)</span>
            <span className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(a.total)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-y-1 text-sm">
            <dt className="text-slate-400">Documento</dt>
            <dd className="col-span-2 font-medium text-slate-700">{a.vendedor_doc_numero}</dd>
            <dt className="text-slate-400">Constancia</dt>
            <dd className="col-span-2 font-medium text-slate-700">
              N° {a.constancia_numero} · control {a.constancia_control}
            </dd>
            <dt className="text-slate-400">Lugar</dt>
            <dd className="col-span-2 font-medium text-slate-700">{a.transaccion_direccion}</dd>
          </dl>
          {a.observacion && <p className="mt-2 text-sm text-slate-500">{a.observacion}</p>}
          <div className="mt-3 flex flex-col divide-y divide-slate-100">
            {a.items.map((it) => (
              <div key={it.id} className="flex justify-between py-2 text-sm">
                <span className="text-slate-700">
                  {Number(it.cantidad).toLocaleString("es-PY")} × {it.descripcion}
                </span>
                <span className="font-semibold text-slate-800">Gs {formatoGs.format(it.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {a.estado === "aprobado" && (
            <button
              onClick={descargar}
              disabled={descargando}
              className="rounded-xl bg-navy py-3 font-semibold text-white hover:bg-navy-2 disabled:opacity-60"
            >
              {descargando ? "Descargando…" : "Descargar KUDE (PDF)"}
            </button>
          )}
          {["error", "rechazado", "enviado", "pendiente"].includes(a.estado) && (
            <button
              onClick={reintentar}
              disabled={reintentando}
              className="rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
            >
              {reintentando ? "Consultando…" : a.estado === "enviado" || a.estado === "pendiente" ? "Ver estado" : "Reintentar"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
