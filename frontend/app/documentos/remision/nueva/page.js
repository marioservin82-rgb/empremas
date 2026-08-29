"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const campo =
  "mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

const MOTIVOS = [
  { v: 1, t: "Traslado por venta" },
  { v: 7, t: "Traslado entre locales" },
  { v: 4, t: "Traslado por compra" },
  { v: 6, t: "Traslado por devolución" },
  { v: 2, t: "Traslado por consignación" },
  { v: 9, t: "Traslado por reparación" },
  { v: 11, t: "Exhibición o demostración" },
];

export default function NuevaRemision() {
  const router = useRouter();
  const [cliente, setCliente] = useState(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [f, setF] = useState({
    direccionEntrega: "",
    motivo: 1,
    observacion: "",
    aFacturarDespues: true,
    fechaFuturaFactura: new Date().toISOString().slice(0, 10),
  });
  const [tienePreset, setTienePreset] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/preset-remision")
      .then((r) => setTienePreset(!!r.preset))
      .catch(() => {});
  }, [router]);

  const bcDeb = useDebounced(busquedaCliente);
  useEffect(() => {
    if (!bcDeb) return setResultadosCliente([]);
    apiFetch(`/api/clientes?q=${encodeURIComponent(bcDeb)}`).then(setResultadosCliente).catch(() => {});
  }, [bcDeb]);

  const bpDeb = useDebounced(busquedaProducto);
  useEffect(() => {
    if (!bpDeb) return setResultadosProducto([]);
    apiFetch(`/api/productos?q=${encodeURIComponent(bpDeb)}`).then(setResultadosProducto).catch(() => {});
  }, [bpDeb]);

  function agregar(p) {
    setCarrito((c) =>
      c.find((i) => i.productoId === p.id)
        ? c.map((i) => (i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i))
        : [{ productoId: p.id, nombre: p.nombre, cantidad: 1 }, ...c],
    );
    setBusquedaProducto("");
    setResultadosProducto([]);
  }

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const r = await apiFetch("/api/remisiones", {
        method: "POST",
        body: JSON.stringify({
          clienteId: cliente?.id || null,
          items: carrito.map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) })),
          direccionEntrega: f.direccionEntrega,
          motivo: Number(f.motivo),
          observacion: f.observacion || null,
          aFacturarDespues: f.aFacturarDespues,
          fechaFuturaFactura: f.aFacturarDespues ? f.fechaFuturaFactura : null,
        }),
      });
      router.push(`/documentos/remision/${r.id}`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const listo =
    carrito.length > 0 && carrito.every((i) => i.cantidad > 0) && f.direccionEntrega.trim().length > 0;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="py-6">
          <Link href="/documentos/remision" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Nueva remisión</h1>
        </div>

        {!tienePreset && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Primero cargá los{" "}
            <Link href="/configuracion/remision" className="font-semibold underline">
              datos de transporte
            </Link>
            .
          </p>
        )}

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <label className={etiqueta}>Cliente (a dónde se entrega)</label>
          {cliente ? (
            <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3">
              <span className="font-semibold text-slate-700">{cliente.nombre}</span>
              <button type="button" onClick={() => setCliente(null)} className="text-sm text-red-500">
                cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                className={campo}
                placeholder="Buscar cliente (opcional)"
              />
              {resultadosCliente.length > 0 && (
                <div className="mb-3 flex flex-col gap-1">
                  {resultadosCliente.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCliente(c);
                        setBusquedaCliente("");
                        setResultadosCliente([]);
                        if (c.direccion && !f.direccionEntrega) setF((v) => ({ ...v, direccionEntrega: c.direccion }));
                      }}
                      className="rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                    >
                      {c.nombre} {c.documento ? `· ${c.documento}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <label className={etiqueta}>Dirección de entrega</label>
          <input
            value={f.direccionEntrega}
            onChange={(e) => setF((v) => ({ ...v, direccionEntrega: e.target.value }))}
            className={campo}
            required
            placeholder="Calle, barrio, referencia"
          />

          <label className={etiqueta}>Productos que se trasladan</label>
          <input
            value={busquedaProducto}
            onChange={(e) => setBusquedaProducto(e.target.value)}
            className={campo}
            placeholder="Buscar producto"
          />
          {resultadosProducto.length > 0 && (
            <div className="mb-3 flex flex-col gap-1">
              {resultadosProducto.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(p)}
                  className="rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          )}
          {carrito.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {carrito.map((i, idx) => (
                <div key={i.productoId} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-700">{i.nombre}</span>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={i.cantidad}
                    onChange={(e) =>
                      setCarrito((c) => c.map((x, j) => (j === idx ? { ...x, cantidad: Number(e.target.value) } : x)))
                    }
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
                  />
                  <button type="button" onClick={() => setCarrito((c) => c.filter((_, j) => j !== idx))} className="text-red-500">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className={etiqueta}>Motivo del traslado</label>
          <select value={f.motivo} onChange={(e) => setF((v) => ({ ...v, motivo: e.target.value }))} className={campo}>
            {MOTIVOS.map((m) => (
              <option key={m.v} value={m.v}>
                {m.t}
              </option>
            ))}
          </select>

          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.aFacturarDespues}
              onChange={(e) => setF((v) => ({ ...v, aFacturarDespues: e.target.checked }))}
            />
            A facturar después (la mercadería sale ahora, se factura al confirmar la entrega)
          </label>
          {f.aFacturarDespues && (
            <>
              <label className={etiqueta}>Fecha estimada de la factura</label>
              <input
                type="date"
                value={f.fechaFuturaFactura}
                onChange={(e) => setF((v) => ({ ...v, fechaFuturaFactura: e.target.value }))}
                className={campo}
              />
            </>
          )}

          <label className={etiqueta}>Observación (opcional)</label>
          <input
            value={f.observacion}
            onChange={(e) => setF((v) => ({ ...v, observacion: e.target.value }))}
            className={campo}
          />

          <p className="mb-4 text-xs text-slate-400">
            El vehículo y el chofer se toman de{" "}
            <Link href="/configuracion/remision" className="underline">
              Datos de transporte
            </Link>
            .
          </p>

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={!listo || enviando || !tienePreset}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-50"
          >
            {enviando ? "Emitiendo…" : "Emitir remisión"}
          </button>
        </form>
      </div>
    </main>
  );
}
