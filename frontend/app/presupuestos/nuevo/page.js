"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

const LISTAS_PRECIO = [
  { valor: "contado", etiqueta: "Contado" },
  { valor: "credito", etiqueta: "Crédito" },
  { valor: "mayorista", etiqueta: "Mayorista" },
];

function fechaEnDias(dias) {
  const fecha = new Date(Date.now() + dias * 86400000);
  return fecha.toISOString().slice(0, 10);
}

export default function NuevoPresupuesto() {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  const [listaPrecio, setListaPrecio] = useState("contado");
  const [vencimiento, setVencimiento] = useState(fechaEnDias(15));

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [cliente, setCliente] = useState(null);

  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState([]);
  const [carrito, setCarrito] = useState([]);

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    setListo(true);
  }, [router]);

  async function ejecutarBusquedaCliente(q) {
    if (!q) {
      setResultadosCliente([]);
      return;
    }
    try {
      setResultadosCliente(await apiFetch(`/api/clientes?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function buscarCliente(e) {
    e.preventDefault();
    ejecutarBusquedaCliente(busquedaCliente);
  }

  const busquedaClienteDebounced = useDebounced(busquedaCliente);
  useEffect(() => {
    ejecutarBusquedaCliente(busquedaClienteDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaClienteDebounced]);

  function seleccionarCliente(c) {
    setCliente(c);
    setResultadosCliente([]);
    setBusquedaCliente("");
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
      const yaExiste = actual.find((i) => i.productoId === p.id);
      if (yaExiste) {
        return actual.map((i) =>
          i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [
        ...actual,
        {
          productoId: p.id,
          nombre: p.nombre,
          unidadMedida: p.unidad_medida,
          cantidad: 1,
          precioUnitario: Number(p[`precio_${listaPrecio}`]),
        },
      ];
    });
    setResultadosProducto([]);
    setBusquedaProducto("");
  }

  function cambiarCantidad(productoId, cantidad) {
    setCarrito((actual) => actual.map((i) => (i.productoId === productoId ? { ...i, cantidad } : i)));
  }

  function cambiarPrecio(productoId, precioUnitario) {
    setCarrito((actual) => actual.map((i) => (i.productoId === productoId ? { ...i, precioUnitario } : i)));
  }

  function quitarDelCarrito(productoId) {
    setCarrito((actual) => actual.filter((i) => i.productoId !== productoId));
  }

  const total = carrito.reduce((acumulado, i) => acumulado + i.precioUnitario * i.cantidad, 0);

  async function guardarPresupuesto() {
    setError("");
    setEnviando(true);
    try {
      const presupuesto = await apiFetch("/api/presupuestos", {
        method: "POST",
        body: JSON.stringify({
          clienteId: cliente?.id,
          listaPrecio,
          vencimiento,
          items: carrito.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
          })),
        }),
      });
      router.push(`/presupuestos/${presupuesto.id}`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  if (!listo) return null;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/presupuestos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Nuevo presupuesto</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-2 text-sm font-medium text-slate-500">Lista de precio</p>
          <div className="mb-4 flex gap-2">
            {LISTAS_PRECIO.map((l) => (
              <button
                key={l.valor}
                onClick={() => setListaPrecio(l.valor)}
                className={`flex-1 rounded-xl py-3 font-bold transition ${
                  listaPrecio === l.valor ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {l.etiqueta}
              </button>
            ))}
          </div>

          <label className="mb-1 block text-sm font-medium text-slate-500">Válido hasta</label>
          <input
            type="date"
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Cliente (opcional)</p>
          {cliente ? (
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">{cliente.nombre}</p>
              <button onClick={() => setCliente(null)} className="text-sm font-medium text-red-500 hover:text-red-700">
                Quitar
              </button>
            </div>
          ) : (
            <div>
              <form onSubmit={buscarCliente} className="flex gap-2">
                <input
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  placeholder="Buscar por nombre, cédula o RUC..."
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
                <button type="submit" className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">
                  Buscar
                </button>
              </form>
              {resultadosCliente.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {resultadosCliente.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => seleccionarCliente(c)}
                      className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold">{c.nombre}</span>{" "}
                      <span className="text-sm text-slate-400">{c.documento}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
                  <span className="text-slate-500">Gs {formatoGs.format(p[`precio_${listaPrecio}`])}</span>
                </button>
              ))}
            </div>
          )}

          {carrito.length === 0 ? (
            <p className="py-10 text-center text-slate-400">Carrito vacío — buscá un producto para empezar</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {carrito.map((i) => (
                <div key={i.productoId} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{i.nombre}</p>
                    <p className="text-sm text-slate-400">{i.unidadMedida}</p>
                  </div>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={i.cantidad}
                    onChange={(e) => cambiarCantidad(i.productoId, Number(e.target.value) || 0)}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-center text-lg"
                    title="Cantidad"
                  />
                  <input
                    type="number"
                    min="0"
                    value={i.precioUnitario}
                    onChange={(e) => cambiarPrecio(i.productoId, Number(e.target.value) || 0)}
                    className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-center text-lg"
                    title="Precio unitario"
                  />
                  <p className="w-28 text-right font-bold text-slate-800">
                    Gs {formatoGs.format(i.precioUnitario * i.cantidad)}
                  </p>
                  <button onClick={() => quitarDelCarrito(i.productoId)} className="text-red-500 hover:text-red-700">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {carrito.length > 0 && (
            <>
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <p className="text-lg font-semibold text-slate-600">Total</p>
                <p className="text-3xl font-extrabold text-blue-900">Gs {formatoGs.format(total)}</p>
              </div>

              {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <button
                onClick={guardarPresupuesto}
                disabled={enviando}
                className="mt-4 w-full rounded-xl bg-emerald-700 py-4 text-xl font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60"
              >
                {enviando ? "Guardando..." : "Guardar presupuesto"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
