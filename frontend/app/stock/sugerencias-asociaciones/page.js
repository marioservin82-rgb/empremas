"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function SugerenciasAsociaciones() {
  const router = useRouter();
  const [sugerencias, setSugerencias] = useState(null);
  const [error, setError] = useState("");
  const [resolviendo, setResolviendo] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/productos/sugerencias-asociaciones")
      .then(setSugerencias)
      .catch((err) => setError(err.message));
  }, [router]);

  async function resolver(s, decision) {
    const clave = `${s.productoId}:${s.asociadoId}`;
    setResolviendo(clave);
    try {
      await apiFetch("/api/productos/sugerencias-asociaciones/resolver", {
        method: "POST",
        body: JSON.stringify({ productoId: s.productoId, productoAsociadoId: s.asociadoId, decision }),
      });
      setSugerencias((actual) => actual.filter((x) => `${x.productoId}:${x.asociadoId}` !== clave));
    } catch (err) {
      setError(err.message);
    } finally {
      setResolviendo(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Venta cruzada — sugerencias automáticas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Combinaciones de productos que se repiten en tus ventas reales. Aprobá las que quieras ofrecer al cajero,
            descartá las que no tengan sentido.
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {sugerencias === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : sugerencias.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-slate-500 shadow shadow-slate-200">
            Todavía no hay suficientes ventas repetidas para sugerir asociaciones automáticas. Esto mejora solo a
            medida que se cargan más ventas.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {sugerencias.map((s) => {
              const clave = `${s.productoId}:${s.asociadoId}`;
              return (
                <div key={clave} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                  <p className="text-slate-800">
                    <span className="font-bold">{s.productoNombre}</span> +{" "}
                    <span className="font-bold">{s.asociadoNombre}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Se compran juntos en el {s.porcentaje}% de las ventas de {s.productoNombre} ({s.ventasJuntas} ventas)
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => resolver(s, "aprobar")}
                      disabled={resolviendo === clave}
                      className="rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      onClick={() => resolver(s, "descartar")}
                      disabled={resolviendo === clave}
                      className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                    >
                      ✕ Descartar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
