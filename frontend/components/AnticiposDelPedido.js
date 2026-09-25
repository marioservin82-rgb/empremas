"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const FORMAS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta de crédito" },
  { valor: "tarjeta_debito", etiqueta: "Tarjeta de débito" },
];
const ETIQUETA_FORMA_PAGO = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.etiqueta]));

// campo: el nombre que espera el backend (query param al listar, campo
// del body al crear). Un solo componente, reusado igual en Presupuestos,
// Internaciones y Reparaciones - las tres pantallas donde un cliente
// puede dejar plata antes de que exista la venta final.
const CAMPO_POR_ORIGEN = {
  presupuesto: "presupuestoId",
  internacion: "internacionId",
  reparacion: "reparacionId",
};

function fechaHora(f) {
  return new Date(f).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AnticiposDelPedido({ origen, origenId, clienteId }) {
  const campo = CAMPO_POR_ORIGEN[origen];
  const [anticipos, setAnticipos] = useState(null);
  const [error, setError] = useState("");

  const [registrando, setRegistrando] = useState(false);
  const [monto, setMonto] = useState("");
  const [formaPago, setFormaPago] = useState("efectivo");
  const [enviando, setEnviando] = useState(false);

  const [anulandoId, setAnulandoId] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [pinAnulacion, setPinAnulacion] = useState("");
  const [enviandoAnulacion, setEnviandoAnulacion] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState("");

  function cargar() {
    apiFetch(`/api/anticipos?${campo}=${origenId}`)
      .then(setAnticipos)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId]);

  async function registrarAnticipo(e) {
    e.preventDefault();
    if (!(Number(monto) > 0)) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      await apiFetch("/api/anticipos", {
        method: "POST",
        body: JSON.stringify({ clienteId, monto: Number(monto), formaPago, [campo]: origenId }),
      });
      setMonto("");
      setFormaPago("efectivo");
      setRegistrando(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarAnulacion(id) {
    if (!motivoAnulacion.trim()) {
      setErrorAnulacion("Indicá el motivo de la anulación");
      return;
    }
    setErrorAnulacion("");
    setEnviandoAnulacion(true);
    try {
      await apiFetch(`/api/anticipos/${id}/anular`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivoAnulacion, pin: pinAnulacion || undefined }),
      });
      setAnulandoId(null);
      setMotivoAnulacion("");
      setPinAnulacion("");
      cargar();
    } catch (err) {
      setErrorAnulacion(err.message);
    } finally {
      setEnviandoAnulacion(false);
    }
  }

  const totalDisponible = (anticipos || [])
    .filter((a) => a.estado === "disponible")
    .reduce((acc, a) => acc + Number(a.monto), 0);

  return (
    <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-slate-800">Anticipos</p>
        {totalDisponible > 0 && (
          <p className="text-sm font-semibold text-emerald-700">Disponible: Gs {formatoGs.format(totalDisponible)}</p>
        )}
      </div>

      {anticipos === null ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : anticipos.length === 0 ? (
        <p className="text-sm text-slate-400">Todavía no se registró ningún anticipo.</p>
      ) : (
        <div className="mb-3 flex flex-col divide-y divide-slate-100">
          {anticipos.map((a) => (
            <div key={a.id} className="py-2">
              <div className="flex items-center justify-between text-sm">
                <span className={a.estado === "anulado" ? "text-slate-400 line-through" : "font-medium text-slate-700"}>
                  Gs {formatoGs.format(a.monto)} · {ETIQUETA_FORMA_PAGO[a.forma_pago]}
                </span>
                <span className="text-xs text-slate-400">{fechaHora(a.creado_en)}</span>
              </div>
              <p className="text-xs text-slate-400">
                {a.usuario_nombre}
                {a.estado === "aplicado" && " · Ya aplicado a una venta"}
                {a.estado === "anulado" && ` · Anulado: ${a.motivo_anulacion}`}
              </p>

              {a.estado === "disponible" && anulandoId !== a.id && (
                <button
                  onClick={() => setAnulandoId(a.id)}
                  className="mt-1 text-xs font-semibold text-red-500 hover:text-red-700"
                >
                  Anular
                </button>
              )}
              {anulandoId === a.id && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <input
                    value={motivoAnulacion}
                    onChange={(e) => setMotivoAnulacion(e.target.value)}
                    placeholder="Motivo"
                    className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                  <input
                    value={pinAnulacion}
                    onChange={(e) => setPinAnulacion(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="PIN (dejalo vacío si sos dueño/encargado)"
                    inputMode="numeric"
                    className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                  {errorAnulacion && <p className="mb-2 text-xs text-red-700">{errorAnulacion}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setAnulandoId(null);
                        setErrorAnulacion("");
                      }}
                      className="flex-1 rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => confirmarAnulacion(a.id)}
                      disabled={enviandoAnulacion}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {enviandoAnulacion ? "Anulando..." : "Confirmar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {!registrando ? (
        <button
          onClick={() => setRegistrando(true)}
          className="text-sm font-semibold text-navy hover:text-brand"
        >
          + Registrar anticipo
        </button>
      ) : (
        <form onSubmit={registrarAnticipo} className="rounded-xl border border-slate-200 p-3">
          <input
            type="number"
            min="1"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="Monto (Gs)"
            autoFocus
            className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            {FORMAS_PAGO.map((f) => (
              <button
                key={f.valor}
                type="button"
                onClick={() => setFormaPago(f.valor)}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  formaPago === f.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRegistrando(false)}
              className="flex-1 rounded-lg bg-slate-100 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
            >
              {enviando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
