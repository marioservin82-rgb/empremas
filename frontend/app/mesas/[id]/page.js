"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import CampoCantidad from "@/components/CampoCantidad";

const formatoGs = new Intl.NumberFormat("es-PY");

const TIPOS_PEDIDO = [
  { valor: "mesa", etiqueta: "En el local" },
  { valor: "llevar", etiqueta: "Para llevar" },
  { valor: "delivery", etiqueta: "Delivery" },
];

const FORMAS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta de crédito" },
  { valor: "tarjeta_debito", etiqueta: "Tarjeta de débito" },
];

const ETIQUETA_ENTREGA = { preparando: "Preparando", en_camino: "En camino", entregado: "Entregado" };

export default function DetalleMesa() {
  const router = useRouter();
  const { id } = useParams();

  const [mesa, setMesa] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState("");

  // Paso 1: cliente
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [clienteElegido, setClienteElegido] = useState(null);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nombreClienteNuevo, setNombreClienteNuevo] = useState("");
  const [celularClienteNuevo, setCelularClienteNuevo] = useState("");
  const [tipoPedido, setTipoPedido] = useState("mesa");
  const [direccionEntrega, setDireccionEntrega] = useState("");
  const [creandoPedido, setCreandoPedido] = useState(false);

  // Paso 2: items
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState([]);
  const [frecuentes, setFrecuentes] = useState([]);
  const [agregando, setAgregando] = useState(false);

  // Cierre de cuenta
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [formaPagoCierre, setFormaPagoCierre] = useState("efectivo");
  const [montoCierre, setMontoCierre] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [cierreOk, setCierreOk] = useState(null);

  function cargarMesa() {
    apiFetch("/api/mesas")
      .then((lista) => {
        const m = lista.find((x) => x.id === id);
        if (!m) {
          setError("Esa mesa no existe");
          return;
        }
        setMesa(m);
        if (m.pedido_id && !m.es_virtual) {
          cargarPedido(m.pedido_id);
        }
      })
      .catch((err) => setError(err.message));
  }

  function cargarPedido(pedidoId) {
    apiFetch(`/api/pedidos/${pedidoId}`)
      .then((p) => {
        setPedido(p);
        if (p.cliente_id) {
          apiFetch(`/api/clientes/${p.cliente_id}/productos-frecuentes`)
            .then(setFrecuentes)
            .catch(() => {});
        }
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargarMesa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const busquedaClienteDebounced = useDebounced(busquedaCliente);
  useEffect(() => {
    if (!busquedaClienteDebounced) {
      setResultadosCliente([]);
      return;
    }
    apiFetch(`/api/clientes?q=${encodeURIComponent(busquedaClienteDebounced)}`)
      .then(setResultadosCliente)
      .catch(() => {});
  }, [busquedaClienteDebounced]);

  function elegirCliente(c) {
    setClienteElegido(c);
    setResultadosCliente([]);
    setBusquedaCliente("");
    if (c.direccion) setDireccionEntrega(c.direccion);
  }

  async function crearClienteRapido(e) {
    e.preventDefault();
    setError("");
    try {
      const nuevo = await apiFetch("/api/clientes", {
        method: "POST",
        body: JSON.stringify({ nombre: nombreClienteNuevo, celular: celularClienteNuevo || undefined }),
      });
      elegirCliente(nuevo);
      setCreandoCliente(false);
      setNombreClienteNuevo("");
      setCelularClienteNuevo("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function iniciarPedido() {
    if (!clienteElegido) {
      setError("Elegí primero un cliente");
      return;
    }
    setError("");
    setCreandoPedido(true);
    try {
      const nuevo = await apiFetch("/api/pedidos", {
        method: "POST",
        body: JSON.stringify({
          mesaId: id,
          clienteId: clienteElegido.id,
          tipo: tipoPedido,
          direccionEntrega: tipoPedido === "delivery" ? direccionEntrega || undefined : undefined,
        }),
      });
      cargarPedido(nuevo.id);
      cargarMesa();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreandoPedido(false);
    }
  }

  const busquedaProductoDebounced = useDebounced(busquedaProducto);
  useEffect(() => {
    if (!busquedaProductoDebounced) {
      setResultadosProducto([]);
      return;
    }
    apiFetch(`/api/productos?q=${encodeURIComponent(busquedaProductoDebounced)}`)
      .then(setResultadosProducto)
      .catch(() => {});
  }, [busquedaProductoDebounced]);

  async function agregarProducto(p) {
    setError("");
    setAgregando(true);
    try {
      await apiFetch(`/api/pedidos/${pedido.id}/items`, {
        method: "POST",
        body: JSON.stringify({ productoId: p.id, cantidad: 1 }),
      });
      setBusquedaProducto("");
      setResultadosProducto([]);
      cargarPedido(pedido.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setAgregando(false);
    }
  }

  async function pedirLaCuenta() {
    setError("");
    try {
      await apiFetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "cuenta_pedida" }),
      });
      cargarPedido(pedido.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cambiarEstadoEntrega(estadoEntrega) {
    setError("");
    try {
      await apiFetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estadoEntrega }),
      });
      cargarPedido(pedido.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const total = (pedido?.items || []).reduce((acumulado, i) => acumulado + Number(i.precio_unitario) * Number(i.cantidad), 0);

  function abrirCierre() {
    setMostrarCierre(true);
    setFormaPagoCierre("efectivo");
    setMontoCierre(String(total));
  }

  async function cerrarCuenta(e) {
    e.preventDefault();
    setError("");
    setCerrando(true);
    try {
      const resultado = await apiFetch(`/api/pedidos/${pedido.id}/cerrar-cuenta`, {
        method: "POST",
        body: JSON.stringify({
          tipoComprobante: "ticket_comun",
          pagos: [{ formaPago: formaPagoCierre, monto: Number(montoCierre) || total }],
        }),
      });
      setCierreOk(resultado);
      setMostrarCierre(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCerrando(false);
    }
  }

  if (!mesa) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-slate-500">Cargando...</p>}
      </main>
    );
  }

  if (cierreOk) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg shadow-slate-200">
          <p className="mb-2 text-lg font-bold text-slate-800">Cuenta cerrada</p>
          <p className="mb-1 text-slate-500">Total Gs {formatoGs.format(cierreOk.total)}</p>
          {Number(cierreOk.vuelto) > 0 && <p className="mb-4 text-slate-500">Vuelto Gs {formatoGs.format(cierreOk.vuelto)}</p>}
          <Link href="/mesas" className="block w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light">
            Volver a Mesas
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link href="/mesas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">{mesa.nombre}</h1>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!pedido ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Paso 1: elegí el cliente</p>

            {clienteElegido ? (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-navy/30 bg-navy/5 p-3">
                <span className="font-semibold text-navy">{clienteElegido.nombre}</span>
                <button onClick={() => setClienteElegido(null)} className="text-sm text-slate-500 hover:text-slate-700">
                  Cambiar
                </button>
              </div>
            ) : creandoCliente ? (
              <form onSubmit={crearClienteRapido} onKeyDown={avanzarConEnter} className="mb-4 rounded-xl border border-slate-200 p-3">
                <input
                  required
                  value={nombreClienteNuevo}
                  onChange={(e) => setNombreClienteNuevo(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  value={celularClienteNuevo}
                  onChange={(e) => setCelularClienteNuevo(e.target.value)}
                  placeholder="Celular (opcional)"
                  className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCreandoCliente(false)} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white">
                    Crear cliente
                  </button>
                </div>
              </form>
            ) : (
              <>
                <input
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  placeholder="Buscar cliente por nombre..."
                  className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                {resultadosCliente.length > 0 && (
                  <div className="mb-2 flex flex-col gap-1">
                    {resultadosCliente.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => elegirCliente(c)}
                        className="rounded-lg border border-slate-200 p-2 text-left text-sm font-semibold hover:bg-slate-50"
                      >
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setCreandoCliente(true)} className="mb-4 text-sm font-semibold text-navy hover:text-brand">
                  + Crear cliente nuevo
                </button>
              </>
            )}

            <label className="mb-1 block text-sm font-medium text-slate-700">Tipo de pedido</label>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {TIPOS_PEDIDO.map((t) => (
                <button
                  key={t.valor}
                  onClick={() => setTipoPedido(t.valor)}
                  className={`rounded-xl py-2 text-sm font-semibold transition ${
                    tipoPedido === t.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t.etiqueta}
                </button>
              ))}
            </div>

            {tipoPedido === "delivery" && (
              <>
                <label className="mb-1 block text-sm font-medium text-slate-700">Dirección de entrega</label>
                <input
                  value={direccionEntrega}
                  onChange={(e) => setDireccionEntrega(e.target.value)}
                  className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  placeholder="Dirección de entrega"
                />
              </>
            )}

            <button
              onClick={iniciarPedido}
              disabled={!clienteElegido || creandoPedido}
              className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {creandoPedido ? "Iniciando..." : "Iniciar pedido"}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200">
              <p className="text-sm text-slate-400">Cliente</p>
              <p className="font-semibold text-slate-800">{pedido.cliente_nombre}</p>
              {pedido.tipo === "delivery" && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <p className="text-sm text-slate-400">Estado de entrega</p>
                  <div className="mt-1 flex gap-2">
                    {Object.keys(ETIQUETA_ENTREGA).map((estado) => (
                      <button
                        key={estado}
                        onClick={() => cambiarEstadoEntrega(estado)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                          pedido.estado_entrega === estado ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {ETIQUETA_ENTREGA[estado]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {frecuentes.length > 0 && (
              <div className="mb-4 rounded-2xl bg-tint p-3">
                <p className="mb-2 text-sm font-semibold text-navy">Este cliente suele llevar:</p>
                <div className="flex flex-wrap gap-2">
                  {frecuentes.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => agregarProducto(p)}
                      className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-navy shadow-sm hover:bg-navy hover:text-white"
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200">
              <p className="mb-2 font-semibold text-slate-700">Agregar producto</p>
              <input
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                placeholder="Buscar producto..."
                disabled={agregando}
                className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              {resultadosProducto.length > 0 && (
                <div className="flex flex-col gap-1">
                  {resultadosProducto.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => agregarProducto(p)}
                      disabled={agregando}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-semibold">{p.nombre}</span>
                      <span className="text-slate-500">Gs {formatoGs.format(p.precio_contado)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200">
              <p className="mb-2 font-semibold text-slate-700">Pedido</p>
              {pedido.items.length === 0 ? (
                <p className="text-sm text-slate-400">Todavía no se cargó ningún ítem.</p>
              ) : (
                <div className="flex flex-col divide-y divide-slate-100">
                  {pedido.items.map((i) => (
                    <div key={i.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-semibold text-slate-700">
                          {i.cantidad} × {i.producto_nombre}
                        </span>
                        {i.nota && <span className="ml-2 text-xs text-slate-400">({i.nota})</span>}
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            i.estado_cocina === "listo" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {i.estado_cocina === "listo" ? "Listo" : "En cocina"}
                        </span>
                      </div>
                      <span className="font-semibold text-slate-800">
                        Gs {formatoGs.format(i.precio_unitario * i.cantidad)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-800">
                <span>Total</span>
                <span>Gs {formatoGs.format(total)}</span>
              </div>
            </div>

            {mostrarCierre ? (
              <form onSubmit={cerrarCuenta} className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200">
                <p className="mb-3 font-semibold text-slate-700">Cerrar cuenta</p>
                <label className="mb-1 block text-sm font-medium text-slate-700">Forma de pago</label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {FORMAS_PAGO.map((f) => (
                    <button
                      key={f.valor}
                      type="button"
                      onClick={() => setFormaPagoCierre(f.valor)}
                      className={`rounded-xl py-2 text-sm font-semibold transition ${
                        formaPagoCierre === f.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {f.etiqueta}
                    </button>
                  ))}
                </div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Monto recibido (Gs)</label>
                <input
                  type="number"
                  min={total}
                  value={montoCierre}
                  onChange={(e) => setMontoCierre(e.target.value)}
                  className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMostrarCierre(false)} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200">
                    Cancelar
                  </button>
                  <button type="submit" disabled={cerrando} className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60">
                    {cerrando ? "Cerrando..." : "Confirmar cierre"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex gap-2">
                {pedido.estado === "abierto" && (
                  <button onClick={pedirLaCuenta} className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200">
                    Pedir la cuenta
                  </button>
                )}
                <button
                  onClick={abrirCierre}
                  disabled={pedido.items.length === 0}
                  className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                >
                  Cerrar cuenta
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
