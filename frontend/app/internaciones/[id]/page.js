"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import AnticiposDelPedido from "@/components/AnticiposDelPedido";

const CLAVE_VENTA_EN_CURSO = "empremas_venta_en_curso";
const formatoGs = new Intl.NumberFormat("es-PY");

function fechaHora(f) {
  return f ? new Date(f).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function DetalleInternacion() {
  const router = useRouter();
  const { id } = useParams();

  const [internacion, setInternacion] = useState(null);
  const [error, setError] = useState("");
  const [cambiando, setCambiando] = useState(false);
  const [notaAlta, setNotaAlta] = useState("");

  async function cargar() {
    try {
      setInternacion(await apiFetch(`/api/internaciones/${id}`));
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
      const actualizado = await apiFetch(`/api/internaciones/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado, notaAlta: estado === "dado_de_alta" ? notaAlta || undefined : undefined }),
      });
      setInternacion((actual) => ({ ...actual, ...actualizado }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiando(false);
    }
  }

  async function cobrar() {
    // Igual que Reparaciones: el precio no se conoce de antemano (depende
    // de cuantos dias se quedo) - se lleva el cliente ya elegido, sin
    // ningun item precargado; lo que corresponda se carga en Vender. Los
    // anticipos ya cobrados (disponibles) se precargan como pagos ya
    // hechos, para no tener que acordarse de descontarlos a mano.
    let pagos = [];
    try {
      const anticipos = await apiFetch(`/api/anticipos?internacionId=${internacion.id}`);
      pagos = anticipos
        .filter((a) => a.estado === "disponible")
        .map((a) => ({ formaPago: a.forma_pago, monto: Number(a.monto), anticipoId: a.id }));
    } catch {
      // Si falla traer los anticipos, se sigue igual sin precargar nada -
      // el cajero puede cobrar y aplicar el anticipo despues a mano.
    }
    localStorage.setItem(
      CLAVE_VENTA_EN_CURSO,
      JSON.stringify({
        tipoPago: "contado",
        tipoComprobante: "ticket_comun",
        internacionId: internacion.id,
        cliente: {
          id: internacion.cliente_id,
          nombre: internacion.cliente_nombre,
          documento: internacion.cliente_documento,
          celular: internacion.cliente_celular,
        },
        carrito: [],
        pagos,
        vendedorId: "",
      })
    );
    router.push("/vender");
  }

  if (error && !internacion) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }
  if (!internacion) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  const diasTranscurridos = Math.max(
    1,
    Math.ceil(
      (new Date(internacion.fecha_alta || new Date()) - new Date(internacion.fecha_ingreso)) / 86400000
    )
  );
  const estimado = internacion.tarifa_diaria ? Number(internacion.tarifa_diaria) * diasTranscurridos : null;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/internaciones" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">
              N° {internacion.numero} · {internacion.mascota_nombre}
            </h1>
            <p className="text-sm text-slate-400">
              {internacion.mascota_especie} · Dueño: {internacion.cliente_nombre}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${
              internacion.estado === "internado" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {internacion.estado === "internado" ? "Internado" : "Dado de alta"}
          </span>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-400">Motivo</p>
              <p className="font-semibold text-slate-700">{internacion.motivo}</p>
            </div>
            <div>
              <p className="text-slate-400">Ingreso</p>
              <p className="font-semibold text-slate-700">{fechaHora(internacion.fecha_ingreso)}</p>
            </div>
            <div>
              <p className="text-slate-400">Tarifa diaria</p>
              <p className="font-semibold text-slate-700">
                {internacion.tarifa_diaria ? `Gs ${formatoGs.format(internacion.tarifa_diaria)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-400">{internacion.estado === "internado" ? "Días hasta hoy" : "Días de estadía"}</p>
              <p className="font-semibold text-slate-700">
                {diasTranscurridos} {estimado !== null && `(≈ Gs ${formatoGs.format(estimado)})`}
              </p>
            </div>
          </div>
          {internacion.nota_ingreso && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <p className="font-semibold text-slate-700">Nota de ingreso</p>
              <p>{internacion.nota_ingreso}</p>
            </div>
          )}
        </div>

        <div className="mb-4">
          <AnticiposDelPedido origen="internacion" origenId={internacion.id} clienteId={internacion.cliente_id} />
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          {internacion.estado === "internado" ? (
            <>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nota de alta (opcional)</label>
              <textarea
                value={notaAlta}
                onChange={(e) => setNotaAlta(e.target.value)}
                rows={2}
                className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                placeholder="Indicaciones para el dueño, medicación de seguimiento, etc."
              />
              <button
                onClick={() => cambiarEstado("dado_de_alta")}
                disabled={cambiando}
                className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {cambiando ? "Guardando..." : "Dar de alta"}
              </button>
            </>
          ) : (
            <>
              {internacion.nota_alta && (
                <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <p className="font-semibold">Nota de alta</p>
                  <p>{internacion.nota_alta}</p>
                </div>
              )}
              <button
                onClick={() => cambiarEstado("internado")}
                disabled={cambiando}
                className="w-full rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
              >
                {cambiando ? "Guardando..." : "Volver a marcar como internado"}
              </button>
            </>
          )}

          <button
            onClick={cobrar}
            className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light"
          >
            Cobrar
          </button>

          {internacion.ventas.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-medium text-slate-400">Ventas vinculadas</p>
              {internacion.ventas.map((v) => (
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

        <Link href={`/mascotas/${internacion.mascota_id}`} className="text-sm font-semibold text-navy hover:text-brand">
          Ver ficha completa de {internacion.mascota_nombre} →
        </Link>
      </div>
    </main>
  );
}
