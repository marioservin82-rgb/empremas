"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

const FORMAS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta de crédito" },
  { valor: "tarjeta_debito", etiqueta: "Tarjeta de débito" },
];

const ETIQUETA_FORMA_PAGO = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.etiqueta]));

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function margen(costo, precioVenta) {
  if (!(costo > 0)) return null;
  return Math.round(((precioVenta - costo) / costo) * 100);
}

export default function NuevaCompra() {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [resultadosProveedor, setResultadosProveedor] = useState([]);
  const [proveedor, setProveedor] = useState(null);

  const [fechaCompra, setFechaCompra] = useState(hoyISO());
  const [timbrado, setTimbrado] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");

  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState([]);
  const [carrito, setCarrito] = useState([]);

  const [pagos, setPagos] = useState([]);
  const [nuevoPagoForma, setNuevoPagoForma] = useState("");
  const [nuevoPagoMonto, setNuevoPagoMonto] = useState("");

  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    setListo(true);
  }, [router]);

  async function ejecutarBusquedaProveedor(q) {
    if (!q) {
      setResultadosProveedor([]);
      return;
    }
    try {
      setResultadosProveedor(await apiFetch(`/api/proveedores?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function buscarProveedor(e) {
    e.preventDefault();
    ejecutarBusquedaProveedor(busquedaProveedor);
  }

  const busquedaProveedorDebounced = useDebounced(busquedaProveedor);
  useEffect(() => {
    ejecutarBusquedaProveedor(busquedaProveedorDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaProveedorDebounced]);

  function seleccionarProveedor(p) {
    setProveedor(p);
    setResultadosProveedor([]);
    setBusquedaProveedor("");
    setExito("");
  }

  async function ejecutarBusquedaProducto(q) {
    if (!q) {
      setResultadosProducto([]);
      return;
    }
    try {
      setResultadosProducto(await apiFetch(`/api/productos?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function buscarProducto(e) {
    e.preventDefault();
    ejecutarBusquedaProducto(busquedaProducto);
  }

  const busquedaProductoDebounced = useDebounced(busquedaProducto);
  useEffect(() => {
    ejecutarBusquedaProducto(busquedaProductoDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaProductoDebounced]);

  function agregarAlCarrito(p) {
    setCarrito((actual) => {
      if (actual.find((i) => i.productoId === p.id)) return actual;
      return [
        ...actual,
        {
          productoId: p.id,
          nombre: p.nombre,
          unidadMedida: p.unidad_medida,
          cantidad: 1,
          precioUnitario: Number(p.precio_costo) || 0,
          precioContado: Number(p.precio_contado) || 0,
          precioCredito: Number(p.precio_credito) || 0,
          precioMayorista: Number(p.precio_mayorista) || 0,
        },
      ];
    });
    setResultadosProducto([]);
    setBusquedaProducto("");
  }

  function actualizarItem(productoId, campo, valor) {
    setCarrito((actual) => actual.map((i) => (i.productoId === productoId ? { ...i, [campo]: valor } : i)));
  }

  function quitarDelCarrito(productoId) {
    setCarrito((actual) => actual.filter((i) => i.productoId !== productoId));
  }

  const total = carrito.reduce((acumulado, i) => acumulado + i.cantidad * i.precioUnitario, 0);
  const totalPagado = pagos.reduce((acumulado, p) => acumulado + Number(p.monto), 0);
  const restante = total - totalPagado;

  function elegirFormaNuevoPago(valor) {
    setNuevoPagoForma(valor);
    setNuevoPagoMonto(String(Math.max(restante, 0)));
  }

  function agregarPago() {
    if (!nuevoPagoForma || !(Number(nuevoPagoMonto) > 0)) return;
    setPagos((actual) => [...actual, { formaPago: nuevoPagoForma, monto: Number(nuevoPagoMonto) }]);
    setNuevoPagoForma("");
    setNuevoPagoMonto("");
  }

  function quitarPago(indice) {
    setPagos((actual) => actual.filter((_, i) => i !== indice));
  }

  const puedeConfirmarCredito = proveedor && carrito.length > 0;
  const puedeConfirmarContado = puedeConfirmarCredito && pagos.length > 0 && restante === 0;

  async function confirmarCompra(tipoPago) {
    setError("");
    setEnviando(true);
    try {
      const compra = await apiFetch("/api/compras", {
        method: "POST",
        body: JSON.stringify({
          proveedorId: proveedor.id,
          tipoPago,
          fechaCompra,
          timbrado: timbrado || null,
          numeroFactura: numeroFactura || null,
          pagos: tipoPago === "contado" ? pagos : [],
          items: carrito.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            precioContado: i.precioContado,
            precioCredito: i.precioCredito,
            precioMayorista: i.precioMayorista,
          })),
        }),
      });
      setExito(`Compra registrada — total Gs ${formatoGs.format(compra.total)}`);
      setCarrito([]);
      setProveedor(null);
      setPagos([]);
      setFechaCompra(hoyISO());
      setTimbrado("");
      setNumeroFactura("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!listo) return null;

  const campoPrecio =
    "w-24 rounded-lg border border-slate-300 px-2 py-2 text-right text-sm outline-none focus:border-blue-600";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/proveedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Registrar compra</h1>
        </div>

        {exito && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>
        )}

        {!proveedor ? (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Elegí el proveedor</p>
            <form onSubmit={buscarProveedor} className="flex gap-2">
              <input
                value={busquedaProveedor}
                onChange={(e) => setBusquedaProveedor(e.target.value)}
                placeholder="Buscar por nombre o RUC..."
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
              <button type="submit" className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">
                Buscar
              </button>
            </form>
            {resultadosProveedor.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {resultadosProveedor.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => seleccionarProveedor(p)}
                    className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-semibold">{p.nombre}</span>{" "}
                    <span className="text-sm text-slate-400">{p.documento}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-lg font-bold text-slate-800">{proveedor.nombre}</p>
                <button onClick={() => setProveedor(null)} className="text-sm font-medium text-blue-700 hover:text-blue-900">
                  Cambiar proveedor
                </button>
              </div>

              <p className="mb-2 text-sm font-medium text-slate-500">Datos de la factura (opcional)</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Fecha de compra</label>
                  <input
                    type="date"
                    value={fechaCompra}
                    onChange={(e) => setFechaCompra(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Timbrado</label>
                  <input
                    value={timbrado}
                    onChange={(e) => setTimbrado(e.target.value)}
                    placeholder="XXXXXXXX"
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Nro. Factura</label>
                  <input
                    value={numeroFactura}
                    onChange={(e) => setNumeroFactura(e.target.value)}
                    placeholder="XXX-XXX-XXXXXXX"
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <form onSubmit={buscarProducto} className="mb-3 flex gap-2">
                <input
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  placeholder="Buscar producto por nombre o código de barras..."
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
                <button type="submit" className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">
                  Buscar
                </button>
              </form>

              {resultadosProducto.length > 0 && (
                <div className="mb-4 flex flex-col gap-2">
                  {resultadosProducto.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => agregarAlCarrito(p)}
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold">{p.nombre}</span>
                      <span className="text-slate-500">costo actual Gs {formatoGs.format(p.precio_costo)}</span>
                    </button>
                  ))}
                </div>
              )}

              {carrito.length === 0 ? (
                <p className="py-10 text-center text-slate-400">Todavía no agregaste productos</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {carrito.map((i) => (
                    <div key={i.productoId} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">{i.nombre}</p>
                          <p className="text-sm text-slate-400">{i.unidadMedida}</p>
                        </div>
                        <button onClick={() => quitarDelCarrito(i.productoId)} className="text-red-500 hover:text-red-700">
                          ✕
                        </button>
                      </div>

                      <div className="mb-3 flex items-center gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">Cantidad</label>
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={i.cantidad}
                            onChange={(e) => actualizarItem(i.productoId, "cantidad", Number(e.target.value) || 0)}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-center text-lg"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">Costo unitario</label>
                          <input
                            type="number"
                            min="0"
                            value={i.precioUnitario}
                            onChange={(e) => actualizarItem(i.productoId, "precioUnitario", Number(e.target.value) || 0)}
                            className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-center text-lg"
                          />
                        </div>
                        <p className="ml-auto text-right font-bold text-slate-800">
                          Gs {formatoGs.format(i.cantidad * i.precioUnitario)}
                        </p>
                      </div>

                      <div className="border-t border-dashed border-slate-200 pt-3">
                        <p className="mb-2 text-xs font-medium text-slate-500">
                          Precios de venta (se guardan al confirmar la compra)
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {[
                            ["precioContado", "Contado"],
                            ["precioCredito", "Crédito"],
                            ["precioMayorista", "Mayorista"],
                          ].map(([campo, etiqueta]) => {
                            const m = margen(i.precioUnitario, i[campo]);
                            return (
                              <div key={campo}>
                                <label className="mb-1 block text-xs text-slate-400">{etiqueta}</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={i[campo]}
                                  onChange={(e) => actualizarItem(i.productoId, campo, Number(e.target.value) || 0)}
                                  className={campoPrecio}
                                />
                                {m !== null && (
                                  <p className={`mt-1 text-xs ${m >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                    {m >= 0 ? "+" : ""}
                                    {m}%
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {carrito.length > 0 && (
                <>
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="mb-2 text-sm font-medium text-slate-500">
                      Si la pagás ahora, indicá cómo (opcional si va a crédito)
                    </p>

                    {pagos.length > 0 && (
                      <div className="mb-3 flex flex-col gap-2">
                        {pagos.map((p, indice) => (
                          <div
                            key={indice}
                            className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2"
                          >
                            <span className="font-semibold text-slate-700">{ETIQUETA_FORMA_PAGO[p.formaPago]}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-700">Gs {formatoGs.format(p.monto)}</span>
                              <button onClick={() => quitarPago(indice)} className="text-red-500 hover:text-red-700">
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {restante !== 0 ? (
                      <>
                        {pagos.length > 0 && (
                          <p
                            className={`mb-2 text-sm font-semibold ${
                              restante > 0 ? "text-amber-600" : "text-red-600"
                            }`}
                          >
                            {restante > 0
                              ? `Falta cubrir: Gs ${formatoGs.format(restante)}`
                              : `Sobra Gs ${formatoGs.format(-restante)} — ajustá los montos`}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {FORMAS_PAGO.map((f) => (
                            <button
                              key={f.valor}
                              onClick={() => elegirFormaNuevoPago(f.valor)}
                              className={`rounded-xl py-3 font-semibold transition ${
                                nuevoPagoForma === f.valor
                                  ? "bg-blue-700 text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {f.etiqueta}
                            </button>
                          ))}
                        </div>
                        {nuevoPagoForma && (
                          <div className="mt-3">
                            <input
                              type="number"
                              min="0"
                              value={nuevoPagoMonto}
                              onChange={(e) => setNuevoPagoMonto(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                              placeholder="0"
                            />
                            <button
                              onClick={agregarPago}
                              disabled={!(Number(nuevoPagoMonto) > 0)}
                              className="mt-3 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
                            >
                              Agregar {ETIQUETA_FORMA_PAGO[nuevoPagoForma].toLowerCase()}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-lg font-bold text-emerald-600">Total cubierto</p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                    <p className="text-lg font-semibold text-slate-600">Total</p>
                    <p className="text-3xl font-extrabold text-blue-900">Gs {formatoGs.format(total)}</p>
                  </div>

                  {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => confirmarCompra("credito")}
                      disabled={enviando || !puedeConfirmarCredito}
                      className="flex-1 rounded-xl bg-amber-600 py-4 text-lg font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
                    >
                      A crédito
                    </button>
                    <button
                      onClick={() => confirmarCompra("contado")}
                      disabled={enviando || !puedeConfirmarContado}
                      className="flex-1 rounded-xl bg-emerald-700 py-4 text-lg font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                    >
                      A contado
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
