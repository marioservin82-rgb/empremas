"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

function tiempoDesde(fecha) {
  const minutos = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  if (minutos < 1) return "recién";
  return `hace ${minutos} min`;
}

export default function Cocina() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const intervaloRef = useRef(null);

  function cargar() {
    apiFetch("/api/pedidos/comanda")
      .then(setItems)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    intervaloRef.current = setInterval(cargar, 8000);
    return () => clearInterval(intervaloRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function marcarListo(id) {
    try {
      await apiFetch(`/api/pedidos/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estadoCocina: "listo" }),
      });
      setItems((actual) => actual.filter((i) => i.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!items) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  const porMesa = items.reduce((acumulado, i) => {
    (acumulado[i.mesa_nombre] ||= []).push(i);
    return acumulado;
  }, {});

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Comanda de cocina</h1>
          <p className="text-sm text-slate-400">Se actualiza sola cada 8 segundos.</p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {items.length === 0 ? (
          <p className="text-slate-400">No hay ítems pendientes.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(porMesa).map(([mesaNombre, itemsMesa]) => (
              <div key={mesaNombre} className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200">
                <p className="mb-2 font-bold text-navy">{mesaNombre}</p>
                <div className="flex flex-col divide-y divide-slate-100">
                  {itemsMesa.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {i.cantidad} × {i.producto_nombre}
                        </p>
                        {i.nota && <p className="text-xs text-slate-400">{i.nota}</p>}
                        <p className="text-xs text-slate-400">{tiempoDesde(i.creado_en)}</p>
                      </div>
                      <button
                        onClick={() => marcarListo(i.id)}
                        className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light"
                      >
                        Listo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
