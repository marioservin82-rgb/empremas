"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const opciones = [
  {
    nombre: "Líneas de producción",
    descripcion: "Qué fabricás, con su receta (insumos) y sus categorías de calidad",
    href: "/produccion/lineas",
    color: "bg-brand hover:bg-brand-light",
  },
  {
    nombre: "Órdenes de producción",
    descripcion: "Cargar lo producido hoy, y clasificar por calidad",
    href: "/produccion/ordenes",
    color: "bg-navy hover:bg-navy-2",
  },
  {
    nombre: "Producción planificada",
    descripcion: "Lo que planeás producir próximamente, para anticipar compras de insumos",
    href: "/produccion/planificacion",
    color: "bg-slate-700 hover:bg-slate-800",
  },
];

export default function Produccion() {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/actual")
      .then((e) => {
        if (!e.produccion_habilitada) {
          router.push("/panel");
        } else {
          setListo(true);
        }
      })
      .catch(() => router.push("/panel"));
  }, [router]);

  if (!listo) return null;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Producción</h1>
        </div>

        <div className="flex flex-col gap-3">
          {opciones.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className={`rounded-2xl p-5 text-white shadow-lg transition ${o.color}`}
            >
              <p className="text-lg font-bold">{o.nombre}</p>
              <p className="text-sm opacity-90">{o.descripcion}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
