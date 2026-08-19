"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const formatoGs = new Intl.NumberFormat("es-PY");

// Consulta rapida de precio, en ventana flotante (no navega a ningun lado,
// no toca la pantalla de atras) - para responder "¿a cuanto sale esto?" sin
// tener que ir hasta Stock ni empezar una venta. /vender ya tiene su propio
// buscador de productos con precio, asi que ahi este boton no hace falta.
const RUTAS_OCULTAS = ["/", "/registro", "/vender"];

export default function VentanaConsultaPrecio() {
  const pathname = usePathname();
  const [logueado, setLogueado] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setLogueado(!!localStorage.getItem("empremas_token"));
  }, [pathname]);

  const busquedaDebounced = useDebounced(busqueda);
  useEffect(() => {
    if (!abierta || !busquedaDebounced) {
      setResultados([]);
      return;
    }
    apiFetch(`/api/productos?q=${encodeURIComponent(busquedaDebounced)}`)
      .then(setResultados)
      .catch((err) => setError(err.message));
  }, [busquedaDebounced, abierta]);

  function cerrar() {
    setAbierta(false);
    setBusqueda("");
    setResultados([]);
    setError("");
  }

  if (!logueado) return null;
  if (pathname?.startsWith("/admin")) return null;
  if (RUTAS_OCULTAS.includes(pathname)) return null;

  return (
    <div className="fixed bottom-5 left-5 z-50">
      <button
        onClick={() => setAbierta(true)}
        title="Consulta de precio"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-navy text-3xl text-white shadow-lg transition hover:bg-navy-2"
      >
        🏷️
      </button>

      {abierta && (
        <>
          <div className="fixed inset-0 z-10 bg-black/30" onClick={cerrar} />
          <div className="fixed bottom-5 left-5 z-20 w-[90vw] max-w-sm rounded-2xl bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-slate-800">Consulta de precio</p>
              <button onClick={cerrar} className="text-sm font-medium text-slate-400 hover:text-slate-600">
                Cerrar ✕
              </button>
            </div>
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o código de barras..."
              className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />

            {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="max-h-72 overflow-y-auto">
              {resultados.map((p) => (
                <div key={p.id} className="border-b border-slate-100 py-2 last:border-0">
                  <p className="font-semibold text-slate-800">{p.nombre}</p>
                  <div className="flex flex-wrap gap-x-3 text-sm text-slate-600">
                    <span>
                      Contado <strong className="text-slate-800">Gs {formatoGs.format(p.precio_contado)}</strong>
                    </span>
                    {Number(p.precio_credito) > 0 && <span>Crédito Gs {formatoGs.format(p.precio_credito)}</span>}
                    {Number(p.precio_mayorista) > 0 && <span>Mayorista Gs {formatoGs.format(p.precio_mayorista)}</span>}
                  </div>
                  <p className="text-xs text-slate-400">
                    Stock: {p.stock} {p.unidad_medida}
                  </p>
                </div>
              ))}
              {busquedaDebounced && resultados.length === 0 && !error && (
                <p className="py-2 text-sm text-slate-400">Sin resultados.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
