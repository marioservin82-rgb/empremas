"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const opciones = [
  {
    nombre: "Vendedores",
    descripcion: "Alta, tipo de comisión de cada uno, y activar/desactivar",
    href: "/vendedores/lista",
    color: "bg-brand hover:bg-brand-light",
  },
  {
    nombre: "Comisión fija por producto",
    descripcion: "Productos con un monto de comisión fijo, igual para cualquier vendedor",
    href: "/vendedores/comisiones-fijas",
    color: "bg-navy hover:bg-navy-2",
  },
];

export default function Vendedores() {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/actual")
      .then((e) => {
        if (!e.comisiones_habilitadas) {
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
          <h1 className="text-2xl font-bold text-navy">Vendedores</h1>
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
