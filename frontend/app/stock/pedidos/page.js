"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

function fechaHora(f) {
  return `${new Date(f).toLocaleDateString("es-PY")} ${new Date(f).toLocaleTimeString("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function PedidosSucursal() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [cancelando, setCancelando] = useState(null);

  function cargar() {
    setCargando(true);
    setError("");
    apiFetch("/api/pedidos-sucursal/pendientes")
      .then(setPedidos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function cancelar(id) {
    setError("");
    setCancelando(id);
    try {
      await apiFetch(`/api/pedidos-sucursal/${id}/cancelar`, { method: "POST" });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelando(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a Stock
          </Link>
          <h1 className="text-2xl font-bold text-navy">Pedidos de sucursales</h1>
          <p className="mt-1 text-sm text-slate-500">Lo que cada sucursal pidió y todavía espera.</p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : pedidos.length === 0 ? (
          <p className="text-slate-500">No hay pedidos pendientes.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pedidos.map((p) => (
              <div key={p.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="font-bold text-navy">Pedido N° {p.numero}</p>
                    <p className="text-xs text-slate-400">
                      {p.sucursal_nombre} · {p.usuario_nombre} · {fechaHora(p.creado_en)}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Pendiente</span>
                </div>
                {p.nota && <p className="mb-2 text-sm italic text-slate-500">"{p.nota}"</p>}
                <div className="mb-4 flex flex-col divide-y divide-slate-100 border-t border-slate-100 pt-2">
                  {p.items.map((i) => (
                    <div key={i.producto_id} className="flex justify-between py-1.5 text-sm">
                      <span>{i.producto_nombre}</span>
                      <span className="font-semibold">×{formatoGs.format(i.cantidad)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/stock/traslados/nuevo?pedidoId=${p.id}`}
                    className="flex-1 rounded-xl bg-navy py-3 text-center font-semibold text-white hover:bg-navy-2"
                  >
                    Generar traslado desde este pedido
                  </Link>
                  <button
                    onClick={() => cancelar(p.id)}
                    disabled={cancelando === p.id}
                    className="rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                    title="Lo resolví de otra forma (ej. le compré directo a un proveedor)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
