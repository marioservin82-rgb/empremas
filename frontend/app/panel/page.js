"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import CampanaNovedades from "@/components/CampanaNovedades";

const formatoGs = new Intl.NumberFormat("es-PY");

const botones = [
  { nombre: "Vender", icono: "🛒", color: "bg-brand hover:bg-brand-light", href: "/vender" },
  { nombre: "Fiado / Crédito", icono: "📒", color: "bg-navy hover:bg-navy-2", href: "/clientes" },
  { nombre: "Stock / Compras", icono: "📦", color: "bg-navy-2 hover:bg-navy", href: "/stock" },
  { nombre: "Caja", icono: "🔒", color: "bg-slate-700 hover:bg-slate-800", href: "/caja" },
];

// Verde/amarillo/rojo quedan reservados exclusivamente para este
// semaforo (identidad de marca EMPREMAS) - no reusar en botones ni
// decoracion en ningun otro lugar de la app.
const ESTILO_SEMAFORO = {
  verde: { emoji: "🟢", borde: "border-semaforo-ok/40", fondo: "bg-semaforo-ok/10", texto: "text-semaforo-ok" },
  amarillo: { emoji: "🟡", borde: "border-semaforo-warn/40", fondo: "bg-semaforo-warn/10", texto: "text-semaforo-warn" },
  rojo: { emoji: "🔴", borde: "border-semaforo-danger/40", fondo: "bg-semaforo-danger/10", texto: "text-semaforo-danger" },
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
          <h1 className="text-2xl font-bold text-navy">EMPREMAS</h1>
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
            <Link href="/configuracion/recordatorios" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Recordatorios
            </Link>
          )}
          {esSupervisor && (
            <Link href="/perfil/pin" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Mi PIN
            </Link>
          )}
          <CampanaNovedades />
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

      {(() => {
        const extra = [];
        if (yo?.rol === "dueno") {
          extra.push({
            nombre: "Consumo interno",
            icono: "🏠",
            color: "bg-navy hover:bg-navy-2",
            href: "/gastos/salida-stock?motivo=consumo_interno",
          });
        }
        // Pedido inteligente: mismo permiso que ya tiene el backend
        // (dueño/encargado, gestionar_compras) - por eso encargado también
        // lo ve acá, aunque no vea "Consumo interno".
        if (yo?.rol === "dueno" || yo?.rol === "encargado") {
          extra.push({
            nombre: "Pedido inteligente",
            icono: "📋",
            color: "bg-navy hover:bg-navy-2",
            href: "/proveedores",
          });
        }
        const items = [...botones, ...extra];
        const columnas = items.length > 4 ? "grid-cols-3" : "grid-cols-2";

        const secundarios = [];
        if (yo?.rol === "dueno") {
          secundarios.push({ nombre: "Gastos", icono: "💸", href: "/gastos" });
        }
        if (yo?.rol === "dueno" || yo?.rol === "encargado") {
          secundarios.push({ nombre: "Cuentas por cobrar/pagar", icono: "🧾", href: "/reportes/saldos" });
        }
        secundarios.push({ nombre: "Ventas de hoy", icono: "📊", href: "/ventas/resumen-dia" });

        return (
          <>
            <div className={`grid w-full max-w-3xl ${columnas} gap-4`}>
              {items.map((b) => {
                const clases = `flex flex-col items-center justify-center gap-2 rounded-2xl ${b.color} px-3 py-7 text-white shadow-lg transition active:scale-[0.98]`;
                return b.href ? (
                  <Link key={b.nombre} href={b.href} className={clases}>
                    <span className="text-3xl">{b.icono}</span>
                    <span className="text-center text-base font-bold">{b.nombre}</span>
                  </Link>
                ) : (
                  <button key={b.nombre} className={clases}>
                    <span className="text-3xl">{b.icono}</span>
                    <span className="text-center text-base font-bold">{b.nombre}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex w-full max-w-3xl flex-wrap justify-center gap-3">
              {secundarios.map((b) => (
                <Link
                  key={b.nombre}
                  href={b.href}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-600 shadow-sm transition hover:border-navy hover:text-navy active:scale-[0.98]"
                >
                  <span className="text-lg">{b.icono}</span>
                  <span className="text-sm font-semibold">{b.nombre}</span>
                </Link>
              ))}
            </div>
          </>
        );
      })()}
    </main>
  );
}
