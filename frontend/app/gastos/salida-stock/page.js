"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const MOTIVOS = [
  { valor: "consumo_interno", etiqueta: "Consumo interno", color: "bg-purple-700" },
  { valor: "merma_vencimiento", etiqueta: "Merma por vencimiento", color: "bg-amber-600" },
  { valor: "rotura_robo", etiqueta: "Rotura o robo", color: "bg-red-600" },
];

export default function SalidaStock() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [motivo, setMotivo] = useState(searchParams.get("motivo") || "consumo_interno");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");

  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
    }
  }, [router]);

  async function buscar(e) {
    e.preventDefault();
    if (!busqueda) return;
    try {
      setResultados(await apiFetch(`/api/productos?q=${encodeURIComponent(busqueda)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function seleccionar(p) {
    setProducto(p);
    setResultados([]);
    setBusqueda("");
    setCantidad("");
    setNota("");
    setExito("");
  }

  const motivoActual = MOTIVOS.find((m) => m.valor === motivo);
  const puedeConfirmar = producto && Number(cantidad) > 0 && Number(cantidad) <= Number(producto.stock);

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const salida = await apiFetch("/api/gastos/salidas-stock", {
        method: "POST",
        body: JSON.stringify({ productoId: producto.id, motivo, cantidad: Number(cantidad), nota: nota || undefined }),
      });
      setExito(
        `Registrado: ${salida.cantidad} ${producto.unidad_medida} de ${salida.productoNombre} — Gs ${formatoGs.format(salida.total)} a costo. Stock restante: ${formatoGs.format(salida.stockRestante)}`
      );
      setProducto(null);
      setCantidad("");
      setNota("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-blue-900">Registrar salida de stock</h1>
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

        {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>}

        {!producto ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">Buscá el producto</p>
            <form onSubmit={buscar} className="flex gap-2">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o código de barras..."
                className={`flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:ring-2`}
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
                    onClick={() => seleccionar(p)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="text-slate-500">stock {formatoGs.format(p.stock)} {p.unidad_medida}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
            <p className="mb-1 font-bold text-slate-800">{producto.nombre}</p>
            <p className="mb-4 text-sm text-slate-400">
              Stock actual: {formatoGs.format(producto.stock)} {producto.unidad_medida} · Costo: Gs {formatoGs.format(producto.precio_costo)} c/u
              {Number(producto.precio_costo) === 0 && (
                <span className="ml-1 text-amber-600">(sin costo cargado — va a sumar Gs 0)</span>
              )}
            </p>

            <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad</label>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100"
            />

            <label className="mb-1 block text-sm font-medium text-slate-700">Nota (opcional)</label>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: se llevó Juan, se venció el lote..."
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100"
            />

            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setProducto(null)}
                className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cambiar
              </button>
              <button
                onClick={confirmar}
                disabled={enviando || !puedeConfirmar}
                className={`flex-1 rounded-xl ${motivoActual.color} py-3 font-semibold text-white transition disabled:opacity-60`}
              >
                {enviando ? "Guardando..." : `Confirmar ${motivoActual.etiqueta.toLowerCase()}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
