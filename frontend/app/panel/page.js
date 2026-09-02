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
  mesero: "Mesero",
};

export default function Panel() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [salud, setSalud] = useState(null);
  const [esSupervisor, setEsSupervisor] = useState(false);
  const [yo, setYo] = useState(null);
  const [multiSucursal, setMultiSucursal] = useState(false);
  const [venceEn, setVenceEn] = useState(null);
  const [produccionHabilitada, setProduccionHabilitada] = useState(false);
  const [comisionesHabilitadas, setComisionesHabilitadas] = useState(false);
  const [lomiteriaHabilitada, setLomiteriaHabilitada] = useState(false);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalActivaId, setSucursalActivaId] = useState("");
  const [pedidosPendientes, setPedidosPendientes] = useState(0);
  const [trasladosPendientes, setTrasladosPendientes] = useState(0);

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
        setProduccionHabilitada(!!e.produccion_habilitada);
        setComisionesHabilitadas(!!e.comisiones_habilitadas);
        setLomiteriaHabilitada(!!e.lomiteria_habilitada);
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
    // Traslados/pedidos entre sucursales: solo tienen sentido con más de
    // una sucursal - se filtran de nuevo abajo con multiSucursal una vez
    // que /api/empresas/actual responde, pero conviene no ni intentar acá
    // si de entrada no hay for qué.
    setSucursalActivaId(localStorage.getItem("empremas_sucursal_activa") || "");
    apiFetch("/api/sucursales")
      .then(setSucursales)
      .catch(() => {});
    apiFetch("/api/pedidos-sucursal/pendientes")
      .then((lista) => setPedidosPendientes(lista.length))
      .catch(() => {});
    apiFetch("/api/traslados/pendientes")
      .then((lista) => setTrasladosPendientes(lista.length))
      .catch(() => {});
    setListo(true);
  }, [router]);

  function elegirSucursalActiva(id) {
    if (id) {
      localStorage.setItem("empremas_sucursal_activa", id);
    } else {
      localStorage.removeItem("empremas_sucursal_activa");
    }
    // Recarga para que todo lo que ya se pidió (badges, saludo, listas de
    // otras pantallas) refleje la sucursal nueva sin tener que navegar a
    // mano por cada una.
    window.location.reload();
  }

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
                  multiSucursal && !sucursalActivaId && yo.sucursal_nombre ? ` · ${yo.sucursal_nombre}` : ""
                }`
              : "¿Qué querés hacer?"}
          </p>
          {/* Acceso transversal: solo el dueño lo ve - encargado/cajero
              siguen atados a su sucursal fija, como siempre. */}
          {multiSucursal && yo?.rol === "dueno" && sucursales.length > 1 && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Trabajando en</span>
              <select
                value={sucursalActivaId}
                onChange={(e) => elegirSucursalActiva(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-navy outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              >
                <option value="">{yo.sucursal_nombre} (la mía)</option>
                {sucursales
                  .filter((s) => s.activa && s.id !== yo.sucursal_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
              </select>
            </div>
          )}
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
              Documentos electrónicos
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
          <Link href="/perfil/password" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            Mi contraseña
          </Link>
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

      {(pedidosPendientes > 0 || trasladosPendientes > 0) && (
        <div className="mb-6 flex w-full max-w-3xl flex-wrap gap-3">
          {pedidosPendientes > 0 && (
            <Link
              href="/stock/pedidos"
              className="flex flex-1 items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-800 transition hover:bg-amber-100"
            >
              <span className="font-semibold">📋 Pedidos de sucursales</span>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white">
                {pedidosPendientes}
              </span>
            </Link>
          )}
          {trasladosPendientes > 0 && (
            <Link
              href="/stock/traslados"
              className="flex flex-1 items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-800 transition hover:bg-amber-100"
            >
              <span className="font-semibold">🚚 Traslados por confirmar</span>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white">
                {trasladosPendientes}
              </span>
            </Link>
          )}
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
        // El mesero nunca entra a Vender/Stock/Clientes/Caja directo (ver
        // Contexto del modulo de Lomiteria) - sus 4 botones grandes de
        // siempre se reemplazan por uno solo.
        const items =
          yo?.rol === "mesero"
            ? [{ nombre: "Mesas", icono: "🍽️", color: "bg-brand hover:bg-brand-light", href: "/mesas" }]
            : [...botones, ...extra];
        const columnas = items.length > 4 ? "grid-cols-3" : items.length <= 1 ? "grid-cols-1" : "grid-cols-2";

        const secundarios = [];
        if (yo?.rol === "dueno") {
          secundarios.push({ nombre: "Gastos", icono: "💸", href: "/gastos" });
        }
        if (yo?.rol === "dueno" || yo?.rol === "encargado") {
          secundarios.push({ nombre: "Cuentas por cobrar/pagar", icono: "🧾", href: "/reportes/saldos" });
        }
        // Modulo de Produccion: oculto por completo si la empresa no lo
        // activo desde Perfil de Empresa - el permiso extra
        // gestionar_produccion lo evalua el backend en cada endpoint, acá
        // alcanza con dueño/encargado (mismo criterio que Pedido inteligente).
        if (produccionHabilitada && (yo?.rol === "dueno" || yo?.rol === "encargado")) {
          secundarios.push({ nombre: "Producción", icono: "🏭", href: "/produccion" });
        }
        // Modulo de Vendedores por comision: mismo criterio que Produccion.
        if (comisionesHabilitadas && (yo?.rol === "dueno" || yo?.rol === "encargado")) {
          secundarios.push({ nombre: "Vendedores", icono: "🤝", href: "/vendedores" });
        }
        // Modulo de Lomiteria: mismo criterio que Produccion/Vendedores,
        // pero visible para todos los roles (el mesero tambien lo necesita).
        if (lomiteriaHabilitada) {
          secundarios.push({ nombre: "Mesas", icono: "🍽️", href: "/mesas" });
          secundarios.push({ nombre: "Cocina", icono: "🍳", href: "/cocina" });
        }
        if (yo?.rol !== "mesero") {
          secundarios.push({ nombre: "Ventas de hoy", icono: "📊", href: "/ventas/resumen-dia" });
        }
        // Traslados/pedidos entre sucursales: sin sentido con una sola
        // sucursal. Mismo criterio de rol que Ajuste de Inventario
        // (dueño/encargado o cajero con el permiso, este último lo filtra
        // el propio backend en cada endpoint - acá alcanza con no ocultarlo
        // para dueño/encargado).
        if (multiSucursal && (yo?.rol === "dueno" || yo?.rol === "encargado")) {
          secundarios.push({ nombre: "Traslado entre sucursales", icono: "🚚", href: "/stock/traslados/nuevo" });
          secundarios.push({ nombre: "Traslados", icono: "📋", href: "/stock/traslados" });
          secundarios.push({ nombre: "Pedir a la central", icono: "📥", href: "/stock/pedidos/nuevo" });
          secundarios.push({ nombre: "Pedidos de sucursales", icono: "📥", href: "/stock/pedidos" });
        }

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
