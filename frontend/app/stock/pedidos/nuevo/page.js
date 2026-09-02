"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import CampoCantidad from "@/components/CampoCantidad";

export default function NuevoPedidoSucursal() {
  const router = useRouter();
  const [yo, setYo] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [nota, setNota] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedidoEnviado, setPedidoEnviado] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo").then(setYo).catch(() => {});
  }, [router]);

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

  const puedeConfirmar = carrito.length > 0 && carrito.every((i) => Number(i.cantidad) > 0);

  async function enviarPedido() {
    setError("");
    setEnviando(true);
    try {
      const pedido = await apiFetch("/api/pedidos-sucursal", {
        method: "POST",
        body: JSON.stringify({
          items: carrito.map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) })),
          nota: nota || undefined,
        }),
      });
      setPedidoEnviado(pedido);
      setCarrito([]);
      setNota("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (pedidoEnviado) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg shadow-slate-200">
          <p className="mb-1 text-4xl">✅</p>
          <p className="mb-1 text-lg font-bold text-navy">Pedido N° {pedidoEnviado.numero} enviado</p>
          <p className="mb-4 text-sm text-slate-500">
            La central ya lo puede ver — te avisamos acá mismo cuando llegue el traslado.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setPedidoEnviado(null)}
              className="rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light"
            >
              + Pedir algo más
            </button>
            <Link href="/stock" className="rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 hover:bg-slate-200">
              Volver a Stock
            </Link>
          </div>
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
          <h1 className="mt-2 text-2xl font-bold text-navy">Pedir a la central</h1>
          <p className="mt-1 text-sm text-slate-500">Armá la lista de lo que necesitás — la central lo va a ver.</p>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Agregar producto</p>
          <form onSubmit={buscarProducto} className="flex gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o código de barras..."
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:ring-2"
              autoFocus
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
                  <span className="text-slate-500">nos quedan {p.stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {carrito.length > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Lo que necesito</p>
            <div className="flex flex-col gap-3">
              {carrito.map((i) => (
                <div key={i.productoId} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{i.nombre}</span>
                    <button onClick={() => quitarDelCarrito(i.productoId)} className="text-red-500 hover:text-red-700">
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <CampoCantidad
                      value={i.cantidad}
                      onChange={(valor) => cambiarCantidad(i.productoId, valor)}
                      className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
                    />
                    <span className="text-xs text-slate-400">nos quedan {i.stock}</span>
                  </div>
                </div>
              ))}
            </div>

            <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">Nota (opcional)</label>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: urgente para el fin de semana"
              className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              onClick={enviarPedido}
              disabled={enviando || !puedeConfirmar}
              className="mt-2 w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {enviando ? "Enviando..." : "Enviar pedido a la central"}
            </button>
            {yo && <p className="mt-2 text-center text-xs text-slate-400">{yo.nombre} · {yo.sucursal_nombre}</p>}
          </div>
        )}

        {error && carrito.length === 0 && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    </main>
  );
}
