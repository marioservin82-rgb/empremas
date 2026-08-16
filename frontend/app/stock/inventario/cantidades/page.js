"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function InventarioCantidades() {
  const router = useRouter();
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/productos")
      .then(setProductos)
      .catch((err) => setError(err.message));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/stock/inventario" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Inventario de cantidades</h1>
          </div>
          {productos && (
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              Imprimir
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!productos ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="reporte-imprimible overflow-x-auto rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <style>{"@page { size: A4; margin: 15mm; }"}</style>
            <p className="mb-3 hidden font-bold print:block">Inventario de cantidades — {new Date().toLocaleDateString("es-PY")}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-400">
                  <th className="p-3 font-medium">Producto</th>
                  <th className="p-3 font-medium">Código</th>
                  <th className="p-3 font-medium text-right">Cantidad</th>
                  <th className="p-3 font-medium">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 font-medium text-slate-800">{p.nombre}</td>
                    <td className="p-3 text-slate-500">{p.codigo_barras || "—"}</td>
                    <td className="p-3 text-right font-semibold text-slate-800">{formatoGs.format(p.stock)}</td>
                    <td className="p-3 text-slate-500">{p.unidad_medida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
