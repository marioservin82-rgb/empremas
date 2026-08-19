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
  const [creandoProveedorRapido, setCreandoProveedorRapido] = useState(false);
  const [nuevoProveedorNombre, setNuevoProveedorNombre] = useState("");
  const [nuevoProveedorDocumento, setNuevoProveedorDocumento] = useState("");
  const [nuevoProveedorTelefono, setNuevoProveedorTelefono] = useState("");
  const [creandoProveedor, setCreandoProveedor] = useState(false);

  const [fechaCompra, setFechaCompra] = useState(hoyISO());
  const [timbrado, setTimbrado] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");

  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [creandoProductoRapido, setCreandoProductoRapido] = useState(false);
  const [nuevoProductoNombre, setNuevoProductoNombre] = useState("");
  const [nuevoProductoCodigoBarras, setNuevoProductoCodigoBarras] = useState("");
  const [nuevoProductoUnidadMedida, setNuevoProductoUnidadMedida] = useState("unidad");
  const [nuevoProductoPrecioContado, setNuevoProductoPrecioContado] = useState("");
  const [creandoProducto, setCreandoProducto] = useState(false);

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
    setCreandoProveedorRapido(false);
  }

  function abrirProveedorRapido() {
    setCreandoProveedorRapido(true);
    setNuevoProveedorNombre(busquedaProveedor);
    setNuevoProveedorDocumento("");
    setNuevoProveedorTelefono("");
  }

  async function crearProveedorRapido(e) {
    e.preventDefault();
    setError("");
    setCreandoProveedor(true);
    try {
      const nuevo = await apiFetch("/api/proveedores", {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevoProveedorNombre,
          documento: nuevoProveedorDocumento || undefined,
          telefono: nuevoProveedorTelefono || undefined,
        }),
      });
      seleccionarProveedor(nuevo);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreandoProveedor(false);
    }
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
        ...actual,
      ];
    });
    setResultadosProducto([]);
    setBusquedaProducto("");
  }

  function abrirProductoRapido() {
    setCreandoProductoRapido(true);
    setNuevoProductoNombre(busquedaProducto);
    setNuevoProductoCodigoBarras("");
    setNuevoProductoUnidadMedida("unidad");
    setNuevoProductoPrecioContado("");
  }

  // Igual que en Nuevo producto: el lector de codigo de barras manda un
  // Enter al terminar de escanear, que sin esto enviaria el form entero.
  function evitarEnvioPorLectorDeCodigo(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.form?.elements?.namedItem("nuevoProductoPrecioContado")?.focus();
    }
  }

  async function crearProductoRapido(e) {
    e.preventDefault();
    setError("");
    setCreandoProducto(true);
    try {
      const nuevo = await apiFetch("/api/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevoProductoNombre,
          codigoBarras: nuevoProductoCodigoBarras || undefined,
          unidadMedida: nuevoProductoUnidadMedida,
          precioContado: Number(nuevoProductoPrecioContado) || 0,
        }),
      });
      agregarAlCarrito(nuevo);
      setCreandoProductoRapido(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreandoProducto(false);
    }
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
    "w-24 rounded-lg border border-slate-300 px-2 py-2 text-right text-sm outline-none focus:border-navy";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/proveedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Registrar compra</h1>
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
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
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

            {creandoProveedorRapido ? (
              <form onSubmit={crearProveedorRapido} className="mt-3 rounded-xl border border-slate-200 p-4">
                <p className="mb-3 font-semibold text-slate-700">Proveedor nuevo</p>
                <label className="mb-1 block text-xs text-slate-400">Nombre / Razón social</label>
                <input
                  required
                  autoFocus
                  value={nuevoProveedorNombre}
                  onChange={(e) => setNuevoProveedorNombre(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy"
                />
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">RUC (opcional)</label>
                    <input
                      value={nuevoProveedorDocumento}
                      onChange={(e) => setNuevoProveedorDocumento(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Teléfono (opcional)</label>
                    <input
                      value={nuevoProveedorTelefono}
                      onChange={(e) => setNuevoProveedorTelefono(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreandoProveedorRapido(false)}
                    className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creandoProveedor}
                    className="flex-1 rounded-xl bg-brand py-2 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
                  >
                    {creandoProveedor ? "Creando..." : "Crear y usar este proveedor"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={abrirProveedorRapido}
                className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-3 font-semibold text-navy hover:bg-tint"
              >
                + Crear proveedor nuevo
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-lg font-bold text-slate-800">{proveedor.nombre}</p>
                <button onClick={() => setProveedor(null)} className="text-sm font-medium text-navy hover:text-brand">
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
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-navy"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Timbrado</label>
                  <input
                    value={timbrado}
                    onChange={(e) => setTimbrado(e.target.value)}
                    placeholder="XXXXXXXX"
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-navy"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Nro. Factura</label>
                  <input
                    value={numeroFactura}
                    onChange={(e) => setNumeroFactura(e.target.value)}
                    placeholder="XXX-XXX-XXXXXXX"
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-navy"
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
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
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

              {creandoProductoRapido ? (
                <form onSubmit={crearProductoRapido} className="mb-4 rounded-xl border border-slate-200 p-4">
                  <p className="mb-3 font-semibold text-slate-700">Producto nuevo</p>
                  <label className="mb-1 block text-xs text-slate-400">Nombre</label>
                  <input
                    required
                    autoFocus
                    value={nuevoProductoNombre}
                    onChange={(e) => setNuevoProductoNombre(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy"
                  />
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Código de barras</label>
                      <input
                        value={nuevoProductoCodigoBarras}
                        onChange={(e) => setNuevoProductoCodigoBarras(e.target.value)}
                        onKeyDown={evitarEnvioPorLectorDeCodigo}
                        placeholder="Opcional (podés escanear acá)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Unidad de medida</label>
                      <input
                        value={nuevoProductoUnidadMedida}
                        onChange={(e) => setNuevoProductoUnidadMedida(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy"
                      />
                    </div>
                  </div>
                  <label className="mb-1 block text-xs text-slate-400">Precio de venta contado (Gs)</label>
                  <input
                    required
                    name="nuevoProductoPrecioContado"
                    type="number"
                    min="1"
                    value={nuevoProductoPrecioContado}
                    onChange={(e) => setNuevoProductoPrecioContado(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy"
                    placeholder="0"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCreandoProductoRapido(false)}
                      className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creandoProducto}
                      className="flex-1 rounded-xl bg-brand py-2 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
                    >
                      {creandoProducto ? "Creando..." : "Crear y agregar a la compra"}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={abrirProductoRapido}
                  className="mb-4 w-full rounded-xl border border-dashed border-slate-300 py-3 font-semibold text-navy hover:bg-tint"
                >
                  + Crear producto nuevo
                </button>
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
                                  ? "bg-navy text-white"
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
                              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                              placeholder="0"
                            />
                            <button
                              onClick={agregarPago}
                              disabled={!(Number(nuevoPagoMonto) > 0)}
                              className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-50"
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
                    <p className="text-3xl font-extrabold text-navy">Gs {formatoGs.format(total)}</p>
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
                      className="flex-1 rounded-xl bg-brand py-4 text-lg font-bold text-white transition hover:bg-brand-light disabled:opacity-60"
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
