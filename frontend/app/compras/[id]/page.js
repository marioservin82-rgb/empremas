"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");
const FORMAS_PAGO = [
  { valor: "efectivo", texto: "Efectivo" },
  { valor: "transferencia", texto: "Transferencia" },
  { valor: "tarjeta_credito", texto: "Tarjeta de crédito" },
  { valor: "tarjeta_debito", texto: "Tarjeta de débito" },
];
const ETIQUETA_FORMA = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.texto]));

function fecha(v) {
  return v ? new Date(v).toLocaleDateString("es-PY") : "—";
}

export default function DetalleCompra() {
  const router = useRouter();
  const { id } = useParams();
  const [compra, setCompra] = useState(null);
  const [error, setError] = useState("");
  const [modo, setModo] = useState("ver"); // "ver" | "editar" | "anular"
  const [hayTurnoAbierto, setHayTurnoAbierto] = useState(false);

  const cargar = useCallback(
    () => apiFetch(`/api/compras/${id}`).then(setCompra),
    [id],
  );

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar().catch((e) => setError(e.message));
    apiFetch("/api/turnos/actual").then((t) => setHayTurnoAbierto(!!t)).catch(() => {});
  }, [cargar, router]);

  if (error && !compra) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }
  if (!compra) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="py-6">
          <Link href="/proveedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Compra</h1>
          <p className="text-sm text-slate-400">
            {compra.proveedor_nombre} · {fecha(compra.fecha_compra)}
            {compra.anulada && <span className="ml-2 font-bold text-red-500">ANULADA</span>}
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Total</span>
            <span className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(compra.total)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-400">Forma de pago</dt>
            <dd className="font-medium text-slate-700">{compra.tipo_pago === "credito" ? "Crédito" : "Contado"}</dd>
            <dt className="text-slate-400">N° de factura</dt>
            <dd className="font-medium text-slate-700">{compra.numero_factura || "—"}</dd>
            <dt className="text-slate-400">Timbrado</dt>
            <dd className="font-medium text-slate-700">{compra.timbrado || "—"}</dd>
            {compra.anulada && (
              <>
                <dt className="text-slate-400">Anulada</dt>
                <dd className="font-medium text-red-600">
                  {fecha(compra.anulada_en)} · {compra.anulada_por_nombre || "—"}
                </dd>
                <dt className="text-slate-400">Motivo</dt>
                <dd className="font-medium text-slate-700">{compra.motivo_anulacion}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Productos</h2>
          <div className="flex flex-col divide-y divide-slate-100">
            {compra.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">
                  {Number(it.cantidad).toLocaleString("es-PY")} × {it.producto_nombre}
                </span>
                <span className="font-semibold text-slate-800">Gs {formatoGs.format(it.subtotal)}</span>
              </div>
            ))}
          </div>
          {compra.pagos.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-500">Pagos</h2>
              <div className="flex flex-col divide-y divide-slate-100">
                {compra.pagos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">
                      {ETIQUETA_FORMA[p.forma_pago] || p.forma_pago}
                      {p.forma_pago === "efectivo" && (
                        <span className="ml-1 text-xs text-slate-400">
                          · {p.origen === "caja" ? "de la caja" : "de administración"}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-800">Gs {formatoGs.format(p.monto)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {!compra.anulada && modo === "ver" && (
          <div className="flex gap-2">
            <button
              onClick={() => setModo("editar")}
              className="flex-1 rounded-xl bg-navy py-3 font-semibold text-white hover:bg-navy-2"
            >
              Editar
            </button>
            <button
              onClick={() => setModo("anular")}
              className="flex-1 rounded-xl bg-red-50 py-3 font-semibold text-red-600 hover:bg-red-100"
            >
              Anular
            </button>
          </div>
        )}

        {modo === "editar" && (
          <EditarCompra
            compra={compra}
            hayTurnoAbierto={hayTurnoAbierto}
            onListo={() => { setModo("ver"); cargar(); }}
            onCancelar={() => setModo("ver")}
            setError={setError}
          />
        )}
        {modo === "anular" && (
          <AnularCompra id={id} onListo={() => { setModo("ver"); cargar(); }} onCancelar={() => setModo("ver")} setError={setError} />
        )}

        <p className="mt-4 text-xs text-slate-400">
          Editar cambia solo la forma de pago, la fecha y los datos de factura. Para corregir los
          productos hay que anular la compra y volver a cargarla.
        </p>
      </div>
    </main>
  );
}

const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

function EditarCompra({ compra, hayTurnoAbierto, onListo, onCancelar, setError }) {
  const [f, setF] = useState({
    tipoPago: compra.tipo_pago,
    fechaCompra: (compra.fecha_compra || "").slice(0, 10),
    numeroFactura: compra.numero_factura || "",
    timbrado: compra.timbrado || "",
  });
  const [pagos, setPagos] = useState(
    compra.pagos.length
      ? compra.pagos.map((p) => ({ formaPago: p.forma_pago, monto: String(p.monto), origen: p.origen || "administracion" }))
      : [{ formaPago: "efectivo", monto: String(compra.total), origen: hayTurnoAbierto ? "caja" : "administracion" }],
  );
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  const pasaAContado = f.tipoPago === "contado" && compra.tipo_pago !== "contado";
  const sumaPagos = pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0);

  async function guardar() {
    setError("");
    setGuardando(true);
    try {
      const cuerpo = {
        tipoPago: f.tipoPago,
        fechaCompra: f.fechaCompra || null,
        numeroFactura: f.numeroFactura,
        timbrado: f.timbrado,
      };
      if (f.tipoPago === "contado" && compra.tipo_pago !== "contado") {
        cuerpo.pagos = pagos.map((p) => ({
          formaPago: p.formaPago,
          monto: Number(p.monto),
          ...(p.formaPago === "efectivo" ? { origen: p.origen } : {}),
        }));
      }
      await apiFetch(`/api/compras/${compra.id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
      <h2 className="mb-3 text-lg font-bold text-slate-800">Editar compra</h2>

      <label className={etiqueta}>Forma de pago</label>
      <select value={f.tipoPago} onChange={set("tipoPago")} className={campo}>
        <option value="contado">Contado</option>
        <option value="credito">Crédito (fiado)</option>
      </select>

      {pasaAContado && (
        <div className="mb-4 rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-xs text-slate-500">Cómo se pagó (tiene que sumar Gs {formatoGs.format(compra.total)})</p>
          {pagos.map((p, i) => (
            <div key={i} className="mb-2">
              <div className="flex gap-2">
                <select
                  value={p.formaPago}
                  onChange={(e) => setPagos((v) => v.map((x, j) => (j === i ? { ...x, formaPago: e.target.value } : x)))}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  {FORMAS_PAGO.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.texto}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={p.monto}
                  onChange={(e) => setPagos((v) => v.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))}
                  className="w-32 rounded-lg border border-slate-300 px-2 py-2 text-right text-sm"
                />
                {pagos.length > 1 && (
                  <button type="button" onClick={() => setPagos((v) => v.filter((_, j) => j !== i))} className="text-slate-400">✕</button>
                )}
              </div>
              {p.formaPago === "efectivo" && (
                <select
                  value={p.origen}
                  onChange={(e) => setPagos((v) => v.map((x, j) => (j === i ? { ...x, origen: e.target.value } : x)))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"
                >
                  <option value="administracion">Efectivo de administración</option>
                  <option value="caja" disabled={!hayTurnoAbierto}>
                    Efectivo de la caja {hayTurnoAbierto ? "(genera retiro de caja)" : "(no hay caja abierta)"}
                  </option>
                </select>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setPagos((v) => [...v, { formaPago: "efectivo", monto: "" }])} className="text-xs font-semibold text-navy">
            + otra forma
          </button>
          {Math.abs(sumaPagos - Number(compra.total)) > 0.01 && (
            <p className="mt-1 text-xs text-red-500">Falta Gs {formatoGs.format(Number(compra.total) - sumaPagos)}</p>
          )}
        </div>
      )}

      <label className={etiqueta}>Fecha de la compra</label>
      <input type="date" value={f.fechaCompra} onChange={set("fechaCompra")} className={campo} />

      <label className={etiqueta}>N° de factura del proveedor</label>
      <input value={f.numeroFactura} onChange={set("numeroFactura")} className={campo} placeholder="Opcional" />

      <label className={etiqueta}>Timbrado</label>
      <input value={f.timbrado} onChange={set("timbrado")} className={campo} placeholder="Opcional" />

      <div className="flex gap-2">
        <button
          onClick={guardar}
          disabled={guardando || (pasaAContado && Math.abs(sumaPagos - Number(compra.total)) > 0.01)}
          className="flex-1 rounded-xl bg-navy py-3 font-semibold text-white hover:bg-navy-2 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        <button onClick={onCancelar} className="rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function AnularCompra({ id, onListo, onCancelar, setError }) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function anular() {
    setError("");
    setGuardando(true);
    try {
      const r = await apiFetch(`/api/compras/${id}/anular`, { method: "POST", body: JSON.stringify({ motivo }) });
      if (r?.aviso) setError(r.aviso);
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
      <h2 className="mb-1 text-lg font-bold text-slate-800">Anular compra</h2>
      <p className="mb-3 text-sm text-slate-500">
        Devuelve al stock lo que había entrado y, si era a crédito, saca ese monto del saldo del
        proveedor. La compra queda marcada como anulada.
      </p>
      <label className={etiqueta}>Motivo</label>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Ej: cargada por error / duplicada" />
      <div className="flex gap-2">
        <button
          onClick={anular}
          disabled={guardando || !motivo.trim()}
          className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {guardando ? "Anulando…" : "Anular compra"}
        </button>
        <button onClick={onCancelar} className="rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200">
          Cancelar
        </button>
      </div>
    </div>
  );
}
