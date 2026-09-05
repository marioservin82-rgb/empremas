"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { linkWhatsapp } from "@/lib/whatsapp";

const CLAVE_VENTA_EN_CURSO = "empremas_venta_en_curso";
const formatoGs = new Intl.NumberFormat("es-PY");

const ESTILO_ESTADO = {
  pendiente: "bg-amber-100 text-amber-700",
  atendida: "bg-emerald-100 text-emerald-700",
  cancelada: "bg-slate-100 text-slate-500",
  no_asistio: "bg-red-100 text-red-700",
};
const ETIQUETA_ESTADO = {
  pendiente: "Pendiente",
  atendida: "Atendida",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

function fechaISO(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

function hora(f) {
  return new Date(f).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}

export default function Citas() {
  const router = useRouter();
  const [fecha, setFecha] = useState(fechaISO(0));
  const [profesionales, setProfesionales] = useState([]);
  const [profesionalId, setProfesionalId] = useState("");
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState("");
  const [mostrarSelectorSucursal, setMostrarSelectorSucursal] = useState(false);
  const [citas, setCitas] = useState(null);
  const [error, setError] = useState("");
  const [cambiandoId, setCambiandoId] = useState(null);

  async function cargar(f, profId, sucId) {
    setError("");
    try {
      const query = new URLSearchParams({ fecha: f });
      if (profId) query.set("profesionalId", profId);
      if (sucId) query.set("sucursalId", sucId);
      setCitas(await apiFetch(`/api/citas?${query.toString()}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/citas/profesionales?activo=true")
      .then(setProfesionales)
      .catch(() => {});
    apiFetch("/api/usuarios/yo")
      .then((yo) => {
        if (yo.rol === "dueno" || yo.rol === "encargado") {
          apiFetch("/api/empresas/actual")
            .then((e) => {
              if (e.limite_sucursales > 1) {
                setMostrarSelectorSucursal(true);
                apiFetch("/api/sucursales").then(setSucursales).catch(() => {});
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    cargar(fechaISO(0), "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function cambiarFecha(valor) {
    setFecha(valor);
    cargar(valor, profesionalId, sucursalId);
  }
  function cambiarProfesional(valor) {
    setProfesionalId(valor);
    cargar(fecha, valor, sucursalId);
  }
  function cambiarSucursal(valor) {
    setSucursalId(valor);
    cargar(fecha, profesionalId, valor);
  }

  async function cambiarEstado(id, estado) {
    setError("");
    setCambiandoId(id);
    try {
      await apiFetch(`/api/citas/${id}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) });
      await cargar(fecha, profesionalId, sucursalId);
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoId(null);
    }
  }

  function cobrar(c) {
    const carrito = [
      {
        productoId: c.producto_id,
        nombre: c.producto_nombre,
        unidadMedida: c.unidad_medida || "unidad",
        cantidad: 1,
        precioFijo: Number(c.precio_unitario),
        precios: {
          contado: Number(c.precio_unitario),
          credito: Number(c.precio_unitario),
          mayorista: Number(c.precio_unitario),
        },
      },
    ];
    localStorage.setItem(
      CLAVE_VENTA_EN_CURSO,
      JSON.stringify({
        tipoPago: "contado",
        tipoComprobante: "ticket_comun",
        citaId: c.id,
        cliente: { id: c.cliente_id, nombre: c.cliente_nombre, celular: c.cliente_celular },
        carrito,
        pagos: [],
        vendedorId: c.profesional_vendedor_id || "",
      })
    );
    router.push("/vender");
  }

  function recordarWhatsapp(c) {
    const mensaje = `Hola ${c.cliente_nombre}, te confirmamos tu cita para ${c.producto_nombre} el ${new Date(
      c.fecha_hora_inicio
    ).toLocaleDateString("es-PY")} a las ${hora(c.fecha_hora_inicio)}. ¡Te esperamos!`;
    const link = linkWhatsapp(c.cliente_celular, mensaje);
    if (link) window.open(link, "_blank");
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Agenda de citas</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/citas/profesionales"
              className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Profesionales
            </Link>
            <Link
              href="/citas/nueva"
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              + Nueva cita
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white p-5 shadow shadow-slate-200 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => cambiarFecha(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Profesional</label>
            <select
              value={profesionalId}
              onChange={(e) => cambiarProfesional(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            >
              <option value="">Todos</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          {mostrarSelectorSucursal && (
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Sucursal</label>
              <select
                value={sucursalId}
                onChange={(e) => cambiarSucursal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              >
                <option value="">La mía</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {citas === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : citas.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-slate-500 shadow shadow-slate-200">
            Sin citas para este día.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {citas.map((c) => (
              <div key={c.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {hora(c.fecha_hora_inicio)} · {c.producto_nombre}
                    </p>
                    <p className="text-sm text-slate-400">
                      {c.cliente_nombre} · {c.profesional_nombre} · {c.duracion_minutos} min
                    </p>
                    {c.nota && <p className="mt-1 text-sm italic text-slate-500">"{c.nota}"</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${ESTILO_ESTADO[c.estado]}`}>
                    {ETIQUETA_ESTADO[c.estado]}
                  </span>
                </div>

                {c.estado === "pendiente" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => cobrar(c)}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light"
                    >
                      Cobrar
                    </button>
                    {c.cliente_celular && (
                      <button
                        onClick={() => recordarWhatsapp(c)}
                        className="rounded-xl bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-200"
                      >
                        Recordar por WhatsApp
                      </button>
                    )}
                    <button
                      onClick={() => cambiarEstado(c.id, "no_asistio")}
                      disabled={cambiandoId === c.id}
                      className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                    >
                      No asistió
                    </button>
                    <button
                      onClick={() => cambiarEstado(c.id, "cancelada")}
                      disabled={cambiandoId === c.id}
                      className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-slate-200 disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
