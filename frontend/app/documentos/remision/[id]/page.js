"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const ESTILO = {
  pendiente: "bg-amber-100 text-amber-700",
  enviado: "bg-amber-100 text-amber-700",
  aprobado: "bg-emerald-100 text-emerald-700",
  rechazado: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};
const ETIQUETA = {
  pendiente: "Enviando…",
  enviado: "En trámite",
  aprobado: "Aprobada",
  rechazado: "Rechazada",
  error: "Error de envío",
};

export default function DetalleRemision() {
  const router = useRouter();
  const { id } = useParams();
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [reintentando, setReintentando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const intentos = useRef(0);

  const cargar = useCallback(() => apiFetch(`/api/remisiones/${id}`).then(setR), [id]);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    let cancelado = false;
    async function tick() {
      try {
        const d = await apiFetch(`/api/remisiones/${id}`);
        if (cancelado) return;
        setR(d);
        intentos.current += 1;
        const listo = !!d.cdc || ["rechazado", "error"].includes(d.estado);
        if (!listo && intentos.current < 20) setTimeout(tick, 3000);
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
      setR(await apiFetch(`/api/remisiones/${id}/reintentar`, { method: "POST" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setReintentando(false);
    }
  }

  async function descargarKude() {
    setDescargando(true);
    setError("");
    try {
      const token = localStorage.getItem("empremas_token");
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/remisiones/${id}/kude`,
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

  if (error && !r) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }
  if (!r) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando…</p>
      </main>
    );
  }

  const t = r.transporte || {};
  const puedeFacturar = r.estado === "aprobado" && !r.facturada && !r.factura_cdc;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="py-6">
          <Link href="/documentos/remision" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">
            {r.numero_formateado || "Remisión"}
          </h1>
          <p className="text-sm text-slate-400">
            {r.cliente_nombre || "Consumidor Final"} · {new Date(r.creado_en).toLocaleDateString("es-PY")}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
              ESTILO[r.estado] || "bg-slate-100 text-slate-500"
            }`}
          >
            {ETIQUETA[r.estado] || r.estado}
          </span>
          {r.facturada && <span className="ml-2 text-xs font-semibold text-emerald-600">FACTURADA</span>}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {(r.estado === "rechazado" || r.estado === "error") && r.mensaje_error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.mensaje_error}</p>
        )}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Mercadería</h2>
          <div className="flex flex-col divide-y divide-slate-100">
            {r.items.map((it) => (
              <div key={it.id} className="flex justify-between py-2 text-sm text-slate-700">
                <span>{it.producto_nombre}</span>
                <span className="font-semibold">{Number(it.cantidad).toLocaleString("es-PY")}</span>
              </div>
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-400">Entrega en</dt>
            <dd className="font-medium text-slate-700">{r.direccion_entrega}</dd>
            <dt className="text-slate-400">Vehículo</dt>
            <dd className="font-medium text-slate-700">
              {t.vehiculo?.tipo} {t.vehiculo?.marca} · {t.vehiculo?.chapa}
            </dd>
            <dt className="text-slate-400">Chofer</dt>
            <dd className="font-medium text-slate-700">{t.transportista?.chofer?.nombre}</dd>
            {r.fecha_futura_factura && !r.facturada && (
              <>
                <dt className="text-slate-400">Factura estimada</dt>
                <dd className="font-medium text-slate-700">
                  {new Date(`${String(r.fecha_futura_factura).slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY")}
                </dd>
              </>
            )}
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          {puedeFacturar && (
            <Link
              href={`/vender?remision=${r.id}`}
              className="rounded-xl bg-brand py-3 text-center font-semibold text-white hover:bg-brand-light"
            >
              Facturar esta remisión
            </Link>
          )}
          {r.estado === "aprobado" && (
            <button
              onClick={descargarKude}
              disabled={descargando}
              className="rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
            >
              {descargando ? "Descargando…" : "Descargar KUDE (PDF)"}
            </button>
          )}
          {["error", "rechazado", "enviado", "pendiente"].includes(r.estado) && (
            <button
              onClick={reintentar}
              disabled={reintentando}
              className="rounded-xl bg-navy py-3 font-semibold text-white hover:bg-navy-2 disabled:opacity-60"
            >
              {reintentando ? "Consultando…" : r.estado === "enviado" || r.estado === "pendiente" ? "Ver estado" : "Reintentar"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
