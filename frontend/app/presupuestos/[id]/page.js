"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { linkWhatsapp } from "@/lib/whatsapp";
import PresupuestoImprimible from "./PresupuestoImprimible";

const formatoGs = new Intl.NumberFormat("es-PY");

const CLAVE_VENTA_EN_CURSO = "empremas_venta_en_curso";

export default function DetallePresupuesto() {
  const router = useRouter();
  const { id } = useParams();

  const [presupuesto, setPresupuesto] = useState(null);
  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [error, setError] = useState("");
  const [convirtiendo, setConvirtiendo] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    Promise.all([apiFetch(`/api/presupuestos/${id}`), apiFetch("/api/empresas/actual")])
      .then(([p, e]) => {
        setPresupuesto(p);
        setEmpresaInfo(e);
      })
      .catch((err) => setError(err.message));
  }, [id, router]);

  async function convertirAVenta() {
    setError("");
    setConvirtiendo(true);
    try {
      // Si el presupuesto tiene un cliente, se trae la ficha completa (con
      // saldo/línea de crédito) para que Vender pueda mostrar el crédito
      // disponible igual que si se hubiera elegido a mano.
      const cliente = presupuesto.cliente_id ? await apiFetch(`/api/clientes/${presupuesto.cliente_id}`) : null;

      const carrito = presupuesto.items.map((i) => ({
        productoId: i.producto_id,
        nombre: i.producto_nombre,
        unidadMedida: i.unidad_medida,
        cantidad: Number(i.cantidad),
        precioFijo: Number(i.precio_unitario),
        precios: {
          contado: Number(i.precio_unitario),
          credito: Number(i.precio_unitario),
          mayorista: Number(i.precio_unitario),
        },
      }));

      localStorage.setItem(
        CLAVE_VENTA_EN_CURSO,
        JSON.stringify({
          tipoPago: presupuesto.lista_precio,
          tipoComprobante: "ticket_comun",
          presupuestoId: presupuesto.id,
          cliente,
          carrito,
          pagos: [],
        })
      );
      router.push("/vender");
    } catch (err) {
      setError(err.message);
      setConvirtiendo(false);
    }
  }

  if (error && !presupuesto) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!presupuesto || !empresaInfo) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  const mensajeWhatsapp = `Hola ${presupuesto.cliente_nombre || ""}, te paso el presupuesto de ${empresaInfo.razon_social} por Gs ${formatoGs.format(presupuesto.total)}, válido hasta el ${new Date(presupuesto.vencimiento).toLocaleDateString("es-PY")}. (Adjunto la imagen)`.trim();
  const urlWhatsapp = linkWhatsapp(presupuesto.cliente_celular, mensajeWhatsapp);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/presupuestos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">
            {presupuesto.cliente_nombre || "Presupuesto sin cliente"}
          </h1>
          <p className="text-sm font-semibold text-slate-500">
            Presupuesto N° {presupuesto.numero ?? "—"}
          </p>
          <p className="text-sm text-slate-400">
            Vence {new Date(presupuesto.vencimiento).toLocaleDateString("es-PY")}
            {presupuesto.vencido && <span className="ml-2 font-semibold text-red-500">VENCIDO</span>}
          </p>
          {presupuesto.cliente_documento && (
            <p className="text-sm text-slate-400">RUC/CI: {presupuesto.cliente_documento}</p>
          )}
        </div>

        <PresupuestoImprimible
          empresa={empresaInfo}
          presupuesto={presupuesto}
          accionesExtra={
            urlWhatsapp ? (
              <a
                href={urlWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700"
              >
                Enviar por WhatsApp
              </a>
            ) : (
              presupuesto.cliente_id && (
                <span className="self-center text-sm text-slate-400">Sin celular registrado para WhatsApp</span>
              )
            )
          }
        />

        {presupuesto.ventasGeneradas.length > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-2 font-semibold text-slate-700">Ventas generadas desde este presupuesto</p>
            <div className="flex flex-col divide-y divide-slate-100">
              {presupuesto.ventasGeneradas.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-500">{new Date(v.creado_en).toLocaleDateString("es-PY")}</span>
                  <span className="font-semibold text-slate-800">Gs {formatoGs.format(v.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          onClick={convertirAVenta}
          disabled={convirtiendo}
          className="w-full rounded-xl bg-brand py-4 text-xl font-bold text-white transition hover:bg-brand-light disabled:opacity-60"
        >
          {convirtiendo ? "Preparando..." : "Convertir a venta"}
        </button>
        <p className="mt-2 text-center text-sm text-slate-400">
          Se puede reutilizar las veces que haga falta — no queda "usado" después de convertirlo.
        </p>
      </div>
    </main>
  );
}
