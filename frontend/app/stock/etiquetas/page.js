"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

// useSearchParams() exige un limite de Suspense arriba (si no, Next.js
// rechaza el build de produccion con "should be wrapped in a suspense
// boundary") - por eso el default export es solo el wrapper, y toda la
// pantalla real vive en EtiquetasContenido (mismo patron que
// gastos/salida-stock).
export default function Etiquetas() {
  return (
    <Suspense fallback={null}>
      <EtiquetasContenido />
    </Suspense>
  );
}

function EtiquetasContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") || "").split(",").filter(Boolean);

  const [items, setItems] = useState(null); // null = generando/cargando todavia
  const [cantidades, setCantidades] = useState({});
  const [error, setError] = useState("");
  const svgRefs = useRef({});

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    if (ids.length === 0) {
      setError("No se indicó ningún producto para imprimir.");
      setItems([]);
      return;
    }
    // Un solo pedido para toda la tanda: a los productos que ya tenian
    // codigo se les devuelve tal cual (no se pisa), a los que no, se les
    // genera uno interno de una - por eso "Imprimir etiqueta" funciona
    // igual sin importar si el producto ya tenia codigo o no.
    apiFetch("/api/productos/generar-codigo", {
      method: "POST",
      body: JSON.stringify({ productoIds: ids }),
    })
      .then((r) => {
        setItems(r);
        setCantidades(Object.fromEntries(r.map((i) => [i.productoId, 1])));
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarCantidad(productoId, valor) {
    setCantidades((actual) => ({ ...actual, [productoId]: valor }));
  }

  // Una entrada por etiqueta fisica (si pediste 3 de la misma prenda, se
  // repite 3 veces) - cada una con su propia key para el ref del <svg>.
  const etiquetas = (items || []).flatMap((it) =>
    Array.from({ length: Math.max(1, Number(cantidades[it.productoId]) || 1) }, (_, i) => ({
      ...it,
      key: `${it.productoId}-${i}`,
    }))
  );

  useEffect(() => {
    if (etiquetas.length === 0) return;
    let cancelado = false;
    import("jsbarcode").then((mod) => {
      if (cancelado) return;
      const JsBarcode = mod.default;
      etiquetas.forEach((e) => {
        const el = svgRefs.current[e.key];
        if (el) {
          JsBarcode(el, e.codigoBarras, {
            format: "CODE128",
            displayValue: true,
            fontSize: 15,
            height: 42,
            width: 2,
            margin: 6,
          });
        }
      });
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cantidades]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (items === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Generando códigos...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver a Stock
            </Link>
            <h1 className="text-2xl font-bold text-navy">Imprimir etiquetas</h1>
          </div>
          <button
            onClick={() => window.print()}
            className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light"
          >
            Imprimir →
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3">
          {items.map((it) => (
            <div
              key={it.productoId}
              className="flex items-center justify-between rounded-xl bg-white p-4 shadow shadow-slate-200"
            >
              <div>
                <p className="font-semibold text-slate-800">{it.nombre}</p>
                <p className="text-sm text-slate-400">
                  Código <span className="font-semibold text-slate-600">{it.codigoBarras}</span> · Gs{" "}
                  {formatoGs.format(it.precioContado)}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Cantidad</label>
                <input
                  type="number"
                  min="1"
                  value={cantidades[it.productoId] ?? 1}
                  onChange={(e) => cambiarCantidad(it.productoId, e.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-center"
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mb-6 text-xs text-slate-400">
          Cada etiqueta sale en su propia hoja/corte al imprimir — pensado para una impresora de rollo de etiquetas o
          la térmica de tickets vía su driver de Windows. En una impresora común, cada una sale en su propia hoja A4.
        </p>

        <div className="etiquetas-imprimibles flex flex-col items-center gap-3">
          {etiquetas.map((e) => (
            <div
              key={e.key}
              className="etiqueta-individual mx-auto flex w-full max-w-[60mm] flex-col items-center rounded-lg border border-dashed border-slate-300 p-3 print:break-after-page print:border-none"
            >
              <p className="text-center text-sm font-bold leading-tight text-slate-800">{e.nombre}</p>
              <p className="text-center text-sm font-semibold text-slate-600">Gs {formatoGs.format(e.precioContado)}</p>
              <svg ref={(el) => (svgRefs.current[e.key] = el)} className="mt-1 max-w-full" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
