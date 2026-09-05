"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";
import { linkWhatsapp } from "@/lib/whatsapp";

const ESTADOS = ["prueba", "activa", "mora", "suspendida"];

function formatoFecha(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-PY");
}

function paraInput(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toISOString().slice(0, 10);
}

function ModuloToggle({ titulo, descripcion, activo, onCambiar }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 last:mb-0">
      <div>
        <p className="font-semibold text-slate-800">{titulo}</p>
        <p className="text-sm text-slate-400">{descripcion}</p>
      </div>
      <button
        type="button"
        onClick={() => onCambiar(!activo)}
        className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition ${
          activo ? "bg-emerald-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${activo ? "left-7" : "left-1"}`}
        />
      </button>
    </div>
  );
}

export default function AdminEmpresaDetalle() {
  const router = useRouter();
  const { id } = useParams();

  const [empresa, setEmpresa] = useState(null);
  const [contadores, setContadores] = useState([]);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [plan, setPlan] = useState("");
  const [estado, setEstado] = useState("");
  const [limiteUsuarios, setLimiteUsuarios] = useState(3);
  const [limiteSucursales, setLimiteSucursales] = useState(1);
  const [venceEn, setVenceEn] = useState("");
  const [montoPlanMensual, setMontoPlanMensual] = useState("");
  const [contadorId, setContadorId] = useState("");

  const [monto, setMonto] = useState("");
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [notas, setNotas] = useState("");
  const [registrandoPago, setRegistrandoPago] = useState(false);

  const [reseteando, setReseteando] = useState(false);
  const [passwordReseteada, setPasswordReseteada] = useState(null);

  function cargar() {
    return adminFetch(`/api/admin/empresas/${id}`).then((e) => {
      setEmpresa(e);
      setPlan(e.plan);
      setEstado(e.estado);
      setLimiteUsuarios(e.limite_usuarios);
      setLimiteSucursales(e.limite_sucursales);
      setVenceEn(paraInput(e.vence_en));
      setMontoPlanMensual(e.monto_plan_mensual ?? "");
      setContadorId(e.contador_id || "");
    });
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
      return;
    }
    cargar().catch((err) => setError(err.message));
    adminFetch("/api/admin/contadores")
      .then((r) => setContadores(r.contadores.filter((c) => c.activo)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  async function guardarConfiguracion() {
    setError("");
    setExito("");
    setGuardando(true);
    try {
      await adminFetch(`/api/admin/empresas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          plan,
          estado,
          limiteUsuarios: Number(limiteUsuarios),
          limiteSucursales: Number(limiteSucursales),
          venceEn: venceEn || null,
          montoPlanMensual: montoPlanMensual === "" ? null : Number(montoPlanMensual),
          contadorId: contadorId || null,
        }),
      });
      await cargar();
      setExito("Guardado.");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarModulo(campo, valor) {
    setError("");
    setExito("");
    try {
      await adminFetch(`/api/admin/empresas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ [campo]: valor }),
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function registrarPago(e) {
    e.preventDefault();
    setError("");
    setExito("");
    setRegistrandoPago(true);
    try {
      await adminFetch(`/api/admin/empresas/${id}/pagos`, {
        method: "POST",
        body: JSON.stringify({ monto: Number(monto), periodoDesde, periodoHasta, notas }),
      });
      setMonto("");
      setPeriodoDesde("");
      setPeriodoHasta("");
      setNotas("");
      await cargar();
      setExito("Pago registrado.");
    } catch (err) {
      setError(err.message);
    } finally {
      setRegistrandoPago(false);
    }
  }

  async function resetearPasswordDueno() {
    setError("");
    setExito("");
    setPasswordReseteada(null);
    setReseteando(true);
    try {
      const resultado = await adminFetch(`/api/admin/empresas/${id}/resetear-password-dueno`, { method: "POST" });
      setPasswordReseteada(resultado);
    } catch (err) {
      setError(err.message);
    } finally {
      setReseteando(false);
    }
  }

  function copiarPassword() {
    navigator.clipboard?.writeText(passwordReseteada.passwordNueva).catch(() => {});
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  if (error && !empresa) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!empresa) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6">
          <Link href="/admin" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{empresa.razon_social}</h1>
          <p className="text-sm text-slate-400">
            RUC {empresa.ruc} · Usuarios {empresa.usuarios_activos}/{empresa.limite_usuarios} · Sucursales{" "}
            {empresa.sucursales_activas}/{empresa.limite_sucursales}
          </p>
          <Link
            href={`/admin/empresas/${id}/facturacion-electronica`}
            className="mt-3 inline-block rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            Documentos electrónicos →
          </Link>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>}

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Plan y estado</h2>

          <label className={etiqueta}>Plan</label>
          <input value={plan} onChange={(e) => setPlan(e.target.value)} className={campo} />

          <label className={etiqueta}>Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={campo}>
            {ESTADOS.map((estadoOpcion) => (
              <option key={estadoOpcion} value={estadoOpcion}>
                {estadoOpcion}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={etiqueta}>Límite de usuarios</label>
              <input
                type="number"
                min="1"
                value={limiteUsuarios}
                onChange={(e) => setLimiteUsuarios(e.target.value)}
                className={campo}
              />
            </div>
            <div>
              <label className={etiqueta}>Límite de sucursales</label>
              <input
                type="number"
                min="1"
                value={limiteSucursales}
                onChange={(e) => setLimiteSucursales(e.target.value)}
                className={campo}
              />
            </div>
          </div>

          <label className={etiqueta}>Vence el</label>
          <input type="date" value={venceEn} onChange={(e) => setVenceEn(e.target.value)} className={campo} />

          <label className={etiqueta}>Monto de plan mensual (Gs)</label>
          <input
            type="number"
            min="0"
            value={montoPlanMensual}
            onChange={(e) => setMontoPlanMensual(e.target.value)}
            className={campo}
            placeholder="Sin configurar"
          />
          <p className="-mt-3 mb-4 text-xs text-slate-400">
            Base sobre la que se calcula la comisión del contador aliado que haya referido a esta empresa (si tiene).
          </p>

          <label className={etiqueta}>Contador que lo refirió</label>
          <select value={contadorId} onChange={(e) => setContadorId(e.target.value)} className={campo}>
            <option value="">Ninguno</option>
            {contadores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.codigo_referido})
              </option>
            ))}
          </select>

          <button
            onClick={guardarConfiguracion}
            disabled={guardando}
            className="w-full rounded-xl bg-slate-800 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-1 text-lg font-bold text-slate-800">Módulos por tipo de negocio</h2>
          <p className="mb-4 text-sm text-slate-400">
            El cliente no los puede activar solo — se prenden acá según lo que use cada comercio.
          </p>

          <ModuloToggle
            titulo="Módulo de Producción"
            descripcion="Fabricación (ladrillera, chipería...): insumos, recetas, órdenes y costo real por unidad."
            activo={!!empresa.produccion_habilitada}
            onCambiar={(v) => guardarModulo("produccionHabilitada", v)}
          />
          <ModuloToggle
            titulo="Módulo de Lomitería / Restaurante"
            descripcion="Mesas, toma de pedido, comanda de cocina y caja compartida. Activa también Vendedores por comisión."
            activo={!!empresa.lomiteria_habilitada}
            onCambiar={(v) => guardarModulo("lomiteriaHabilitada", v)}
          />
          {empresa.lomiteria_habilitada && (
            <p className="mt-1 text-xs text-slate-400">
              Vendedores por comisión: activo (lo exige Lomitería).
            </p>
          )}
          <ModuloToggle
            titulo="Módulo de Agenda de citas"
            descripcion="Peluquerías/salones: reservar cliente + profesional + servicio + duración, con cobro directo desde la agenda."
            activo={!!empresa.citas_habilitadas}
            onCambiar={(v) => guardarModulo("citasHabilitada", v)}
          />
        </div>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-1 text-lg font-bold text-slate-800">Recuperación de contraseña</h2>
          <p className="mb-4 text-sm text-slate-400">
            Para cuando el dueño te contacta por WhatsApp porque olvidó su contraseña — generá una temporal acá y
            pasásela vos. Se le pisa la que tenía.
          </p>

          {passwordReseteada && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-800">
                Nueva contraseña para <span className="font-semibold">{passwordReseteada.duenoNombre}</span> (
                {passwordReseteada.duenoEmail || passwordReseteada.duenoTelefono}):
              </p>
              <p className="my-2 rounded-lg bg-white px-3 py-2 text-center font-mono text-xl font-bold tracking-wider text-slate-800">
                {passwordReseteada.passwordNueva}
              </p>
              <p className="mb-3 text-xs text-emerald-700">
                Guardala ahora — no se vuelve a mostrar. Decile que la cambie apenas entre (arriba a la derecha, "Mi contraseña").
              </p>
              <div className="flex gap-2">
                <button
                  onClick={copiarPassword}
                  className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Copiar
                </button>
                {passwordReseteada.duenoTelefono && (
                  <a
                    href={linkWhatsapp(
                      passwordReseteada.duenoTelefono,
                      `Hola ${passwordReseteada.duenoNombre}, tu nueva contraseña temporal de EMPREMAS es: ${passwordReseteada.passwordNueva}\n\nEntrá y cambiala apenas puedas desde "Mi contraseña" (arriba a la derecha del panel).`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Enviar por WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          <button
            onClick={resetearPasswordDueno}
            disabled={reseteando}
            className="w-full rounded-xl bg-slate-800 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            {reseteando ? "Generando..." : "Generar contraseña temporal"}
          </button>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Registrar pago</h2>
          <form onSubmit={registrarPago}>
            <label className={etiqueta}>Monto (Gs)</label>
            <input
              type="number"
              min="1"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className={campo}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={etiqueta}>Período desde</label>
                <input
                  type="date"
                  required
                  value={periodoDesde}
                  onChange={(e) => setPeriodoDesde(e.target.value)}
                  className={campo}
                />
              </div>
              <div>
                <label className={etiqueta}>Período hasta</label>
                <input
                  type="date"
                  required
                  value={periodoHasta}
                  onChange={(e) => setPeriodoHasta(e.target.value)}
                  className={campo}
                />
              </div>
            </div>

            <label className={etiqueta}>Notas (opcional)</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} className={campo} />

            <button
              type="submit"
              disabled={registrandoPago}
              className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {registrandoPago ? "Registrando..." : "Registrar pago"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Historial de pagos</h2>
          {empresa.pagos.length === 0 ? (
            <p className="text-slate-500">Todavía no hay pagos registrados.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {empresa.pagos.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800">Gs {Number(p.monto).toLocaleString("es-PY")}</p>
                    <p className="text-sm text-slate-400">{formatoFecha(p.fecha_pago)}</p>
                  </div>
                  <p className="text-sm text-slate-500">
                    Período {formatoFecha(p.periodo_desde)} – {formatoFecha(p.periodo_hasta)} · {p.admin_nombre}
                  </p>
                  {p.notas && <p className="mt-1 text-sm text-slate-400">{p.notas}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
