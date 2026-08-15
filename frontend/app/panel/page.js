"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const botones = [
  { nombre: "Vender", icono: "🛒", color: "bg-blue-700 hover:bg-blue-800", href: "/vender" },
  { nombre: "Fiado / Crédito", icono: "📒", color: "bg-amber-600 hover:bg-amber-700", href: "/clientes" },
  { nombre: "Stock", icono: "📦", color: "bg-emerald-700 hover:bg-emerald-800", href: "/stock" },
  { nombre: "Cerrar caja", icono: "🔒", color: "bg-slate-700 hover:bg-slate-800", href: "/caja" },
];

const ESTILO_SEMAFORO = {
  verde: { emoji: "🟢", borde: "border-emerald-300", fondo: "bg-emerald-50", texto: "text-emerald-800" },
  amarillo: { emoji: "🟡", borde: "border-amber-300", fondo: "bg-amber-50", texto: "text-amber-800" },
  rojo: { emoji: "🔴", borde: "border-red-300", fondo: "bg-red-50", texto: "text-red-800" },
};

const ETIQUETA_ROL = {
  dueno: "Dueño",
  encargado: "Encargado",
  cajero: "Cajero",
};

export default function Panel() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [salud, setSalud] = useState(null);
  const [esSupervisor, setEsSupervisor] = useState(false);
  const [yo, setYo] = useState(null);
  const [multiSucursal, setMultiSucursal] = useState(false);
  const [venceEn, setVenceEn] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then(setYo)
      .catch(() => {});
    apiFetch("/api/empresas/actual")
      .then((e) => {
        setMultiSucursal(e.limite_sucursales > 1);
        setVenceEn(e.vence_en);
      })
      .catch(() => {});
    // Solo dueño/encargado ven esto (el backend devuelve 403 para cajero,
    // en ese caso simplemente no se muestra el panel).
    apiFetch("/api/empresas/salud-financiera")
      .then(setSalud)
      .catch(() => {});
    // Mismo criterio: si esto no da 403, es dueño/encargado y puede tener
    // PIN de autorización para anular ventas.
    apiFetch("/api/usuarios/mi-pin")
      .then(() => setEsSupervisor(true))
      .catch(() => {});
    setListo(true);
  }, [router]);

  function salir() {
    localStorage.removeItem("empremas_token");
    router.push("/");
  }

  if (!listo) return null;

  const estilo = salud ? ESTILO_SEMAFORO[salud.semaforo] : null;

  const diasParaVencer =
    venceEn != null ? Math.ceil((new Date(venceEn) - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const mostrarAvisoVencimiento = yo?.rol === "dueno" && diasParaVencer != null && diasParaVencer <= 7;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="flex w-full max-w-3xl items-center justify-between py-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">EMPREMAS</h1>
          <p className="text-slate-500">
            {yo
              ? `Hola, ${yo.nombre} (${ETIQUETA_ROL[yo.rol]})${
                  multiSucursal && yo.sucursal_nombre ? ` · ${yo.sucursal_nombre}` : ""
                }`
              : "¿Qué querés hacer?"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {yo?.rol === "dueno" && (
            <Link href="/empleados" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Empleados
            </Link>
          )}
          {yo?.rol === "dueno" && (
            <Link href="/configuracion/perfil-empresa" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Mi Empresa
            </Link>
          )}
          {yo?.rol === "dueno" && (
            <Link href="/configuracion/sifen" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Facturación electrónica
            </Link>
          )}
          {yo?.rol === "dueno" && (
            <Link href="/configuracion/impresora" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Impresora
            </Link>
          )}
          {yo?.rol === "dueno" && (
            <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Gastos
            </Link>
          )}
          {esSupervisor && (
            <Link href="/perfil/pin" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Mi PIN
            </Link>
          )}
          <Link href="/ayuda" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            Ayuda
          </Link>
          <button onClick={salir} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            Salir
          </button>
        </div>
      </div>

      {mostrarAvisoVencimiento && (
        <div className="mb-6 w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center">
          <p className="font-semibold text-amber-800">
            {diasParaVencer < 0
              ? "Tu plan de EMPREMAS venció"
              : diasParaVencer === 0
              ? "Tu plan de EMPREMAS vence hoy"
              : `Tu plan de EMPREMAS vence en ${diasParaVencer} día(s)`}{" "}
            — contactate con EMPREMAS para regularizar tu pago.
          </p>
        </div>
      )}

      {salud && (
        <div className={`mb-6 w-full max-w-3xl rounded-2xl border p-5 ${estilo.borde} ${estilo.fondo}`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-2xl">{estilo.emoji}</span>
            <p className={`font-semibold ${estilo.texto}`}>{salud.mensaje}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-slate-400">Por cobrar</p>
              <p className="font-bold text-slate-800">Gs {formatoGs.format(salud.totalPorCobrar)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Por pagar</p>
              <p className="font-bold text-slate-800">Gs {formatoGs.format(salud.totalPorPagar)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Efectivo</p>
              <p className="font-bold text-slate-800">Gs {formatoGs.format(salud.efectivoDisponible)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid w-full max-w-3xl grid-cols-2 gap-5">
        {(yo?.rol === "dueno"
          ? [
              ...botones,
              {
                nombre: "Consumo interno",
                icono: "🏠",
                color: "bg-purple-700 hover:bg-purple-800",
                href: "/gastos/salida-stock?motivo=consumo_interno",
              },
            ]
          : botones
        ).map((b) => {
          const clases = `flex flex-col items-center justify-center gap-3 rounded-2xl ${b.color} px-6 py-14 text-white shadow-lg transition active:scale-[0.98]`;
          return b.href ? (
            <Link key={b.nombre} href={b.href} className={clases}>
              <span className="text-5xl">{b.icono}</span>
              <span className="text-2xl font-bold">{b.nombre}</span>
            </Link>
          ) : (
            <button key={b.nombre} className={clases}>
              <span className="text-5xl">{b.icono}</span>
              <span className="text-2xl font-bold">{b.nombre}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
