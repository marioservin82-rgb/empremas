"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { linkWhatsapp } from "@/lib/whatsapp";

const formatoGs = new Intl.NumberFormat("es-PY");

function fecha(f) {
  return new Date(f).toLocaleDateString("es-PY");
}

export default function ListaPedido() {
  const router = useRouter();
  const { id } = useParams();
  const recuadroRef = useRef(null);

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [incluirComparacion, setIncluirComparacion] = useState(true);
  const [cantidades, setCantidades] = useState({});
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch(`/api/proveedores/${id}/lista-pedido`)
      .then(setDatos)
      .catch((err) => setError(err.message));
  }, [id, router]);

  function actualizarCantidad(productoId, valor) {
    setCantidades((actual) => ({ ...actual, [productoId]: valor }));
  }

  async function descargarImagen() {
    setDescargando(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(recuadroRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const enlace = document.createElement("a");
      enlace.download = `pedido-${datos.proveedor.nombre.replace(/\s+/g, "-").toLowerCase()}.png`;
      enlace.href = canvas.toDataURL("image/png");
      enlace.click();
    } finally {
      setDescargando(false);
    }
  }

  if (!datos) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-slate-500">Cargando...</p>
        )}
      </main>
    );
  }

  const { proveedor, productos } = datos;
  const claseComparacion = incluirComparacion ? "" : "print:hidden";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between py-6 print:hidden">
          <div>
            <Link href={`/proveedores/${id}/extracto`} className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Pedido a {proveedor.nombre}</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={descargarImagen}
              disabled={descargando}
              className="rounded-xl bg-navy px-5 py-3 font-semibold text-white hover:bg-navy-2 disabled:opacity-60"
            >
              {descargando ? "Generando..." : "Descargar imagen"}
            </button>
            {proveedor.telefono ? (
              <a
                href={linkWhatsapp(proveedor.telefono, "Hola, te paso nuestro pedido (adjunto la imagen)")}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
              >
                Enviar por WhatsApp
              </a>
            ) : (
              <span
                title="Este proveedor no tiene teléfono cargado"
                className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-400"
              >
                Sin teléfono
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              Imprimir pedido
            </button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <label className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-600 print:hidden">
          <input
            type="checkbox"
            checked={incluirComparacion}
            onChange={(e) => setIncluirComparacion(e.target.checked)}
          />
          Incluir comparación de precios en el impreso
        </label>

        <div ref={recuadroRef} className="reporte-imprimible rounded-xl bg-white p-6 shadow">
          <style>{"@page { size: A4; margin: 15mm; }"}</style>
          <div className="mb-4 hidden print:block">
            <p className="text-xl font-bold">Pedido a {proveedor.nombre}</p>
            <p className="text-sm text-slate-500">Emitido el {fecha(new Date())}</p>
          </div>

          {productos.length === 0 ? (
            <p className="text-sm text-slate-400">
              Todavía no hay compras registradas de este proveedor, así que no hay productos para sugerir.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-2">Producto</th>
                    <th className="py-2 pr-2">Stock</th>
                    <th className="py-2 pr-2">Punto de pedido</th>
                    <th className="py-2 pr-2">Costo promedio</th>
                    <th className="py-2 pr-2">Precio {proveedor.nombre}</th>
                    <th className={`py-2 pr-2 ${claseComparacion}`}>Otros proveedores</th>
                    <th className="py-2 pr-2">Cantidad a pedir</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p) => {
                    const precioEste = p.precios.find((pr) => pr.esEsteProveedor);
                    const otrosPrecios = p.precios.filter((pr) => !pr.esEsteProveedor);
                    return (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-medium text-slate-800">{p.nombre}</td>
                        <td className="py-2 pr-2">{p.stock}</td>
                        <td className="py-2 pr-2">
                          {p.stockMinimo != null ? p.stockMinimo : "—"}
                          {p.bajoPuntoPedido && (
                            <>
                              <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 print:hidden">
                                Por debajo
                              </span>
                              <span className="ml-1 hidden font-bold print:inline">¡URGENTE!</span>
                            </>
                          )}
                          {p.faltanteProduccionPlanificada > 0 && (
                            <p className="mt-1 text-xs text-amber-700">
                              Para tu producción planificada te faltan {p.faltanteProduccionPlanificada.toLocaleString("es-PY")}
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-slate-500">
                          {p.costoPromedio > 0 ? `Gs ${formatoGs.format(p.costoPromedio)}` : "—"}
                        </td>
                        <td className="py-2 pr-2">
                          {precioEste ? `Gs ${formatoGs.format(precioEste.precio)}` : "—"}
                        </td>
                        <td className={`py-2 pr-2 ${claseComparacion}`}>
                          {otrosPrecios.length === 0
                            ? "—"
                            : otrosPrecios.map((pr, i) => (
                                <span key={pr.proveedorId} className={pr.masBarato ? "font-bold text-emerald-700" : ""}>
                                  {i > 0 && ", "}
                                  {pr.proveedorNombre}: Gs {formatoGs.format(pr.precio)}
                                </span>
                              ))}
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            value={cantidades[p.id] || ""}
                            onChange={(e) => actualizarCantidad(p.id, e.target.value)}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 print:border-slate-800"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
