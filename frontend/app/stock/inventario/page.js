"use client";

import Link from "next/link";

const opciones = [
  {
    nombre: "Ajuste de inventario",
    descripcion: "Corregir el stock de un producto (conteo físico, rotura, vencido...)",
    href: "/stock/inventario/ajuste",
    color: "bg-amber-600 hover:bg-amber-700",
  },
  {
    nombre: "Inventario valorizado",
    descripcion: "Cuánto vale todo el stock, a precio de costo y de venta",
    href: "/stock/inventario/valorizado",
    color: "bg-brand hover:bg-brand-light",
  },
  {
    nombre: "Inventario de cantidades",
    descripcion: "Lista de productos y cantidades, para imprimir",
    href: "/stock/inventario/cantidades",
    color: "bg-brand hover:bg-brand-light",
  },
];

export default function Inventario() {
  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a Stock
          </Link>
          <h1 className="text-2xl font-bold text-navy">Inventario</h1>
        </div>

        <div className="flex flex-col gap-3">
          {opciones.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className={`rounded-2xl p-5 text-white shadow-lg transition ${o.color}`}
            >
              <p className="text-lg font-bold">{o.nombre}</p>
              <p className="text-sm text-white/80">{o.descripcion}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
