"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import NotaRecepcionImprimible from "../NotaRecepcionImprimible";

const CLAVE_VENTA_EN_CURSO = "empremas_venta_en_curso";
const formatoGs = new Intl.NumberFormat("es-PY");

const ESTILO_ESTADO = {
  recibido: "bg-amber-100 text-amber-700",
  en_reparacion: "bg-navy/10 text-navy",
  listo_para_entrega: "bg-emerald-100 text-emerald-700",
  entregado: "bg-slate-100 text-slate-500",
  cancelado: "bg-red-100 text-red-700",
};
const ESTADOS = [
  { valor: "recibido", etiqueta: "Recibido" },
  { valor: "en_reparacion", etiqueta: "En reparación" },
  { valor: "listo_para_entrega", etiqueta: "Listo para entrega" },
  { valor: "entregado", etiqueta: "Entregado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
];

function DetalleReparacionInterno() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const autoImprimir = searchParams.get("imprimir") === "1";

  const [reparacion, setReparacion] = useState(null);
  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [error, setError] = useState("");
  const [cambiando, setCambiando] = useState(false);

  async function cargar() {
    try {
      const [r, e] = await Promise.all([apiFetch(`/api/reparaciones/${id}`), apiFetch("/api/empresas/actual")]);
      setReparacion(r);
      setEmpresaInfo(e);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, id]);

  async function cambiarEstado(estado) {
    setError("");
    setCambiando(true);
    try {
      const actualizado = await apiFetch(`/api/reparaciones/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      });
      setReparacion((actual) => ({ ...actual, ...actualizado }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiando(false);
    }
  }

  function cobrar() {
    // A diferencia de una cita, acá el precio no se conoce de antemano
    // (recién se sabe al diagnosticar) - se lleva el cliente ya elegido,
    // sin ningún ítem precargado: lo que corresponda se carga en Vender.
    localStorage.setItem(
      CLAVE_VENTA_EN_CURSO,
      JSON.stringify({
        tipoPago: "contado",
        tipoComprobante: "ticket_comun",
        reparacionId: reparacion.id,
        cliente: {
          id: reparacion.cliente_id,
          nombre: reparacion.cliente_nombre,
          documento: reparacion.cliente_documento,
          celular: reparacion.cliente_celular,
        },
        carrito: [],
        pagos: [],
        vendedorId: "",
      })
    );
    router.push("/vender");
  }

  if (error && !reparacion) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }
  if (!reparacion || !empresaInfo) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6 print:hidden">
          <div>
            <Link href="/reparaciones" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Recepción N° {reparacion.numero}</h1>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${ESTILO_ESTADO[reparacion.estado]}`}>
            {ESTADOS.find((e) => e.valor === reparacion.estado)?.etiqueta}
          </span>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200 print:hidden">
          <p className="mb-2 text-sm font-medium text-slate-500">Estado</p>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((e) => (
              <button
                key={e.valor}
                onClick={() => cambiarEstado(e.valor)}
                disabled={cambiando || reparacion.estado === e.valor}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition disabled:opacity-100 ${
                  reparacion.estado === e.valor
                    ? "bg-navy text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {e.etiqueta}
              </button>
            ))}
          </div>
          <button
            onClick={cobrar}
            className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light"
          >
            Cobrar
          </button>
          {reparacion.ventas.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-medium text-slate-400">Ventas vinculadas</p>
              {reparacion.ventas.map((v) => (
                <Link
                  key={v.id}
                  href={`/ventas/${v.id}`}
                  className="flex justify-between py-1 text-sm text-navy hover:text-brand"
                >
                  <span>Ticket #{v.numero_ticket ?? "—"}</span>
                  <span>Gs {formatoGs.format(v.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <NotaRecepcionImprimible empresa={empresaInfo} reparacion={reparacion} autoImprimir={autoImprimir} />
      </div>
    </main>
  );
}

export default function DetalleReparacion() {
  return (
    <Suspense fallback={<main className="flex flex-1 items-center justify-center p-6"><p className="text-slate-500">Cargando...</p></main>}>
      <DetalleReparacionInterno />
    </Suspense>
  );
}
