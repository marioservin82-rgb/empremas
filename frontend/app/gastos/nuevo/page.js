"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const formatoGs = new Intl.NumberFormat("es-PY");

const CATEGORIAS = [
  { valor: "servicios_fijos", etiqueta: "Servicios fijos" },
  { valor: "software_suscripciones", etiqueta: "Software y suscripciones" },
  { valor: "personal", etiqueta: "Personal" },
  { valor: "vehiculo_transporte", etiqueta: "Vehículo / Transporte" },
  { valor: "equipos_inversion", etiqueta: "Equipos e inversión" },
  { valor: "otros", etiqueta: "Otros" },
];

const ETIQUETA_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.etiqueta]));

function fecha(f) {
  return new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY");
}

export default function NuevoGasto() {
  const router = useRouter();
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [fechaGasto, setFechaGasto] = useState("");
  const [ordenProduccionId, setOrdenProduccionId] = useState("");
  const [gastos, setGastos] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [produccionHabilitada, setProduccionHabilitada] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargarGastos() {
    apiFetch("/api/gastos")
      .then(setGastos)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargarGastos();
    apiFetch("/api/empresas/actual")
      .then((e) => {
        setProduccionHabilitada(!!e.produccion_habilitada);
        if (e.produccion_habilitada) {
          apiFetch("/api/produccion/ordenes")
            .then(setOrdenes)
            .catch(() => {});
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function guardar(e) {
    e.preventDefault();
    setError("");
    if (!categoria) {
      setError("Elegí una categoría");
      return;
    }
    setGuardando(true);
    try {
      await apiFetch("/api/gastos", {
        method: "POST",
        body: JSON.stringify({
          categoria,
          descripcion,
          monto: Number(monto),
          fechaGasto: fechaGasto || undefined,
          ordenProduccionId: ordenProduccionId || undefined,
        }),
      });
      setCategoria("");
      setDescripcion("");
      setMonto("");
      setFechaGasto("");
      setOrdenProduccionId("");
      cargarGastos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    try {
      await apiFetch(`/api/gastos/${id}`, { method: "DELETE" });
      cargarGastos();
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="py-6">
          <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Nuevo gasto</h1>
        </div>

        <form onSubmit={guardar} className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <p className={etiqueta}>Categoría</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                onClick={() => setCategoria(c.valor)}
                className={`rounded-xl py-2 text-sm font-semibold transition ${
                  categoria === c.valor ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c.etiqueta}
              </button>
            ))}
          </div>

          <label className={etiqueta}>Descripción</label>
          <input required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={campo} placeholder="Ej: Factura de luz de agosto" />

          <label className={etiqueta}>Monto (Gs)</label>
          <input required type="number" min="1" value={monto} onChange={(e) => setMonto(e.target.value)} className={campo} placeholder="0" />

          <label className={etiqueta}>Fecha</label>
          <input type="date" value={fechaGasto} onChange={(e) => setFechaGasto(e.target.value)} className={campo} />

          {produccionHabilitada && categoria === "personal" && (
            <>
              <label className={etiqueta}>Asociar a una orden de producción (opcional)</label>
              <select value={ordenProduccionId} onChange={(e) => setOrdenProduccionId(e.target.value)} className={campo}>
                <option value="">Sin asociar — gasto general del mes</option>
                {ordenes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.linea_nombre} · {new Date(o.fecha).toLocaleDateString("es-PY")} · {o.cantidad_producida}
                  </option>
                ))}
              </select>
            </>
          )}

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-amber-600 py-3 text-lg font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar gasto"}
          </button>
        </form>

        <h2 className="mb-2 text-sm font-medium text-slate-500">Últimos gastos cargados</h2>
        {gastos.length === 0 ? (
          <p className="text-slate-400">Todavía no hay gastos cargados.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {gastos.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-xl bg-white p-4 shadow shadow-slate-200">
                <div>
                  <p className="font-semibold text-slate-800">{g.descripcion}</p>
                  <p className="text-xs text-slate-400">
                    {ETIQUETA_CATEGORIA[g.categoria]} · {fecha(g.fecha_gasto)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-800">Gs {formatoGs.format(g.monto)}</span>
                  <button onClick={() => eliminar(g.id)} className="text-red-500 hover:text-red-700">
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
