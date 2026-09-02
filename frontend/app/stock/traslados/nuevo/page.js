"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import CampoCantidad from "@/components/CampoCantidad";
import ComprobanteTraslado from "../ComprobanteTraslado";

// useSearchParams() exige un limite de Suspense arriba - mismo criterio
// ya usado en gastos/salida-stock.
export default function NuevoTraslado() {
  return (
    <Suspense fallback={null}>
      <NuevoTrasladoContenido />
    </Suspense>
  );
}

function NuevoTrasladoContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pedidoId = searchParams.get("pedidoId");

  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalDestinoId, setSucursalDestinoId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [nota, setNota] = useState("");
  const [pedidoOrigen, setPedidoOrigen] = useState(null);

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [trasladoCreado, setTrasladoCreado] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/actual").then(setEmpresaInfo).catch(() => {});
    apiFetch("/api/sucursales").then(setSucursales).catch(() => {});

    if (pedidoId) {
      apiFetch(`/api/pedidos-sucursal/${pedidoId}`)
        .then((p) => {
          setPedidoOrigen(p);
          setSucursalDestinoId(p.sucursal_id);
          setCarrito(
            p.items.map((i) => ({
              productoId: i.producto_id,
              nombre: i.producto_nombre,
              cantidad: Number(i.cantidad),
            }))
          );
        })
        .catch((err) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pedidoId]);

  async function ejecutarBusqueda(q) {
    if (!q) {
      setResultados([]);
      return;
    }
    try {
      setResultados(await apiFetch(`/api/productos?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    ejecutarBusqueda(busquedaDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced]);

  async function buscarProducto(e) {
    e.preventDefault();
    const q = busqueda;
    if (!q) return;
    try {
      const resultado = await apiFetch(`/api/productos?q=${encodeURIComponent(q)}`);
      const porCodigoExacto = resultado.filter((p) => p.codigo_barras === q);
      if (porCodigoExacto.length === 1) {
        agregarAlCarrito(porCodigoExacto[0]);
      } else {
        setResultados(resultado);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function agregarAlCarrito(p) {
    setError("");
    setCarrito((actual) => {
      const yaExiste = actual.find((i) => i.productoId === p.id);
      if (yaExiste) {
        return actual.map((i) => (i.productoId === p.id ? { ...i, cantidad: Number(i.cantidad) + 1 } : i));
      }
      return [...actual, { productoId: p.id, nombre: p.nombre, stock: Number(p.stock), cantidad: 1 }];
    });
    setBusqueda("");
    setResultados([]);
  }

  function cambiarCantidad(productoId, cantidad) {
    setCarrito((actual) => actual.map((i) => (i.productoId === productoId ? { ...i, cantidad } : i)));
  }

  function quitarDelCarrito(productoId) {
    setCarrito((actual) => actual.filter((i) => i.productoId !== productoId));
  }

  const puedeConfirmar =
    sucursalDestinoId && carrito.length > 0 && carrito.every((i) => Number(i.cantidad) > 0);

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const traslado = await apiFetch("/api/traslados", {
        method: "POST",
        body: JSON.stringify({
          sucursalDestinoId,
          items: carrito.map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) })),
          nota: nota || undefined,
          pedidoSucursalId: pedidoId || undefined,
        }),
      });
      setTrasladoCreado(traslado);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function nuevoTraslado() {
    setTrasladoCreado(null);
    setCarrito([]);
    setSucursalDestinoId("");
    setNota("");
    setPedidoOrigen(null);
    router.push("/stock/traslados/nuevo");
  }

  if (trasladoCreado && empresaInfo) {
    const destino = sucursales.find((s) => s.id === sucursalDestinoId);
    return (
      <main className="flex flex-1 flex-col items-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a Stock
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Traslado N° {trasladoCreado.numero} generado</h1>
          <ComprobanteTraslado
            empresa={empresaInfo}
            traslado={trasladoCreado}
            sucursalDestinoNombre={destino?.nombre || trasladoCreado.sucursalDestinoNombre}
            onNuevoTraslado={nuevoTraslado}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm" onKeyDown={avanzarConEnter}>
        <div className="mb-6">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Nuevo traslado</h1>
          <p className="mt-1 text-sm text-slate-500">
            El stock de tu sucursal baja al confirmar — queda "en camino" hasta que el destino lo confirme.
          </p>
          {pedidoOrigen && (
            <p className="mt-2 rounded-lg bg-tint px-3 py-2 text-xs font-semibold text-navy">
              Precargado desde el Pedido N° {pedidoOrigen.numero} de {pedidoOrigen.sucursal_nombre}
            </p>
          )}
        </div>

        <div className="mb-4 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className="mb-1 block text-sm font-medium text-slate-700">Enviar a</label>
          <select
            value={sucursalDestinoId}
            onChange={(e) => setSucursalDestinoId(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          >
            <option value="">— Elegí una sucursal —</option>
            {sucursales
              .filter((s) => s.activa)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
          </select>

          <p className="mb-3 font-semibold text-slate-700">Agregar producto</p>
          <form onSubmit={buscarProducto} className="flex gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o código de barras..."
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:ring-2"
            />
            <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
              Buscar
            </button>
          </form>
          {resultados.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregarAlCarrito(p)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <span className="font-semibold">{p.nombre}</span>
                  <span className="text-slate-500">stock acá: {p.stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {carrito.length > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Productos a enviar</p>
            <div className="flex flex-col gap-3">
              {carrito.map((i) => (
                <div key={i.productoId} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{i.nombre}</span>
                    <button onClick={() => quitarDelCarrito(i.productoId)} className="text-red-500 hover:text-red-700">
                      ✕
                    </button>
                  </div>
                  <CampoCantidad
                    value={i.cantidad}
                    onChange={(valor) => cambiarCantidad(i.productoId, valor)}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
                  />
                </div>
              ))}
            </div>

            <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">Nota (opcional)</label>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              onClick={confirmar}
              disabled={enviando || !puedeConfirmar}
              className="mt-2 w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {enviando ? "Generando..." : "Generar traslado e imprimir"}
            </button>
          </div>
        )}

        {error && carrito.length === 0 && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    </main>
  );
}
