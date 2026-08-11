"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

export default function InventarioValorizado() {
  const router = useRouter();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/productos/inventario-valorizado")
      .then(setDatos)
      .catch((err) => setError(err.message));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="py-6">
          <Link href="/stock/inventario" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Inventario valorizado</h1>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!datos ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-5 text-center shadow shadow-slate-200">
                <p className="text-sm text-slate-400">Valor a costo</p>
                <p className="text-2xl font-extrabold text-slate-800">Gs {formatoGs.format(datos.totalCosto)}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 text-center shadow shadow-slate-200">
                <p className="text-sm text-slate-400">Valor a precio de venta</p>
                <p className="text-2xl font-extrabold text-emerald-600">Gs {formatoGs.format(datos.totalVenta)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl bg-white shadow shadow-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-400">
                    <th className="p-3 font-medium">Producto</th>
                    <th className="p-3 font-medium text-right">Stock</th>
                    <th className="p-3 font-medium text-right">Costo unit.</th>
                    <th className="p-3 font-medium text-right">Valor costo</th>
                    <th className="p-3 font-medium text-right">Valor venta</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.productos.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-3 font-medium text-slate-800">{p.nombre}</td>
                      <td className="p-3 text-right text-slate-600">
                        {formatoGs.format(p.stock)} {p.unidad_medida}
                      </td>
                      <td className="p-3 text-right text-slate-600">Gs {formatoGs.format(p.precio_costo)}</td>
                      <td className="p-3 text-right font-semibold text-slate-800">Gs {formatoGs.format(p.valor_costo)}</td>
                      <td className="p-3 text-right font-semibold text-emerald-700">Gs {formatoGs.format(p.valor_venta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
