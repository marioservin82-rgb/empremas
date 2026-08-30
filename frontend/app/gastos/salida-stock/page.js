"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import CampoCantidad from "@/components/CampoCantidad";

const formatoGs = new Intl.NumberFormat("es-PY");

const MOTIVOS = [
  { valor: "consumo_interno", etiqueta: "Consumo interno", color: "bg-navy" },
  { valor: "merma_vencimiento", etiqueta: "Merma por vencimiento", color: "bg-amber-600" },
  { valor: "rotura_robo", etiqueta: "Rotura o robo", color: "bg-red-600" },
];

// useSearchParams() exige un limite de Suspense arriba (si no, Next.js
// rechaza el build de produccion con "should be wrapped in a suspense
// boundary") - por eso el default export es solo el wrapper, y toda la
// pantalla real vive en SalidaStockContenido.
export default function SalidaStock() {
  return (
    <Suspense fallback={null}>
      <SalidaStockContenido />
    </Suspense>
  );
}

function SalidaStockContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [motivo, setMotivo] = useState(searchParams.get("motivo") || "consumo_interno");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [nota, setNota] = useState("");

  const [error, setError] = useState("");
  const [resumen, setResumen] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
    }
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

  // Al tipear y tocar "Buscar" (o al leer un código con el lector, que
  // manda el mismo Enter) - si lo escrito matchea el código de barras
  // exacto de un solo producto, es una lectura de código: se agrega
  // directo al carrito (sumando 1 si ya estaba), sin exigir un clic
  // extra por cada unidad leída. Mismo mecanismo que Vender.
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
    setResumen(null);
    setCarrito((actual) => {
      const yaExiste = actual.find((i) => i.productoId === p.id);
      if (yaExiste) {
        return actual.map((i) =>
          i.productoId === p.id ? { ...i, cantidad: Math.min(Number(i.cantidad) + 1, Number(i.stock)) } : i
        );
      }
      return [
        ...actual,
        {
          productoId: p.id,
          nombre: p.nombre,
          unidadMedida: p.unidad_medida,
          stock: Number(p.stock),
          precioCosto: Number(p.precio_costo),
          cantidad: Number(p.stock) > 0 ? 1 : 0,
        },
      ];
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

  const motivoActual = MOTIVOS.find((m) => m.valor === motivo);
  const totalCosto = carrito.reduce((acumulado, i) => acumulado + Number(i.cantidad || 0) * i.precioCosto, 0);
  const puedeConfirmar =
    carrito.length > 0 && carrito.every((i) => Number(i.cantidad) > 0 && Number(i.cantidad) <= i.stock);

  async function confirmarTodo() {
    setError("");
    setEnviando(true);
    const exitosos = [];
    const fallidos = [];
    for (const item of carrito) {
      try {
        const salida = await apiFetch("/api/gastos/salidas-stock", {
          method: "POST",
          body: JSON.stringify({
            productoId: item.productoId,
            motivo,
            cantidad: Number(item.cantidad),
            nota: nota || undefined,
          }),
        });
        exitosos.push({ ...item, total: salida.total });
      } catch (err) {
        fallidos.push({ ...item, error: err.message });
      }
    }
    setCarrito(fallidos.map(({ error: _e, ...resto }) => resto));
    setResumen({ exitosos, fallidos });
    if (exitosos.length > 0) setNota("");
    setEnviando(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm" onKeyDown={avanzarConEnter}>
        <div className="mb-6">
          <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Registrar salida de stock</h1>
          <p className="mt-1 text-sm text-slate-500">
            Se descuenta a costo (no a precio de venta) y no genera ingreso.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {MOTIVOS.map((m) => (
            <button
              key={m.valor}
              onClick={() => setMotivo(m.valor)}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                motivo === m.valor ? `${m.color} text-white` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>

        {resumen && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {resumen.exitosos.length > 0 && (
              <p>
                Registrado{resumen.exitosos.length > 1 ? "s" : ""}: {resumen.exitosos.length} producto
                {resumen.exitosos.length > 1 ? "s" : ""} — Gs{" "}
                {formatoGs.format(resumen.exitosos.reduce((a, i) => a + i.total, 0))} a costo.
              </p>
            )}
            {resumen.fallidos.length > 0 && (
              <p className="mt-1 text-red-700">
                {resumen.fallidos.length} producto{resumen.fallidos.length > 1 ? "s" : ""} no se pudo
                {resumen.fallidos.length > 1 ? "ieron" : ""} registrar — revisá el carrito abajo.
              </p>
            )}
          </div>
        )}

        <div className="mb-4 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Buscá o escaneá el producto</p>
          <form onSubmit={buscarProducto} className="flex gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o código de barras..."
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:ring-2"
              autoFocus
            />
            <button type="submit" className={`rounded-xl ${motivoActual.color} px-6 py-3 font-semibold text-white`}>
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
                  <span className="text-slate-500">
                    stock {formatoGs.format(p.stock)} {p.unidad_medida}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {carrito.length > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Carrito</p>
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
                    <span className="text-xs text-slate-400">
                      {i.unidadMedida} · stock {formatoGs.format(i.stock)}
                    </span>
                  </div>
                  {Number(i.cantidad) > i.stock && (
                    <p className="mt-1 text-xs text-red-600">No hay suficiente stock (quedan {formatoGs.format(i.stock)}).</p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 text-sm font-bold text-slate-800">
              <span>Total a costo</span>
              <span>Gs {formatoGs.format(totalCosto)}</span>
            </div>

            <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">Nota (opcional, para todo el lote)</label>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: se llevó Juan, se venció el lote..."
              className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100"
            />

            {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              onClick={confirmarTodo}
              disabled={enviando || !puedeConfirmar}
              className={`mt-2 w-full rounded-xl ${motivoActual.color} py-3 font-semibold text-white transition disabled:opacity-60`}
            >
              {enviando ? "Guardando..." : `Confirmar ${motivoActual.etiqueta.toLowerCase()} (${carrito.length})`}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
