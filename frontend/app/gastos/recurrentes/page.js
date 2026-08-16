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
  { valor: "otros", etiqueta: "Otros" },
];

const ETIQUETA_CATEGORIA = Object.fromEntries(
  [...CATEGORIAS, { valor: "equipos_inversion", etiqueta: "Equipos e inversión" }].map((c) => [c.valor, c.etiqueta])
);

export default function GastosRecurrentes() {
  const router = useRouter();
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [montoAproximado, setMontoAproximado] = useState("");
  const [plantillas, setPlantillas] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    apiFetch("/api/gastos/recurrentes")
      .then(setPlantillas)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    cargar();
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
      await apiFetch("/api/gastos/recurrentes", {
        method: "POST",
        body: JSON.stringify({ categoria, descripcion, montoAproximado: Number(montoAproximado) }),
      });
      setCategoria("");
      setDescripcion("");
      setMontoAproximado("");
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(plantilla) {
    try {
      await apiFetch(`/api/gastos/recurrentes/${plantilla.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !plantilla.activo }),
      });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-md">
        <div className="py-6">
          <Link href="/gastos" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Gastos recurrentes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Se precargan solos en el balance de cada mes — vos solo ajustás el monto si cambió.
          </p>
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
                  categoria === c.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c.etiqueta}
              </button>
            ))}
          </div>

          <label className={etiqueta}>Descripción</label>
          <input required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={campo} placeholder="Ej: Luz, Internet, EMPREMAS..." />

          <label className={etiqueta}>Monto aproximado (Gs)</label>
          <input required type="number" min="1" value={montoAproximado} onChange={(e) => setMontoAproximado(e.target.value)} className={campo} placeholder="0" />

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar plantilla"}
          </button>
        </form>

        <h2 className="mb-2 text-sm font-medium text-slate-500">Plantillas</h2>
        {plantillas.length === 0 ? (
          <p className="text-slate-400">Todavía no hay gastos recurrentes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {plantillas.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl bg-white p-4 shadow shadow-slate-200 ${
                  !p.activo ? "opacity-50" : ""
                }`}
              >
                <div>
                  <p className="font-semibold text-slate-800">{p.descripcion}</p>
                  <p className="text-xs text-slate-400">{ETIQUETA_CATEGORIA[p.categoria]}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-800">Gs {formatoGs.format(p.monto_aproximado)}</span>
                  <button
                    onClick={() => alternarActivo(p)}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {p.activo ? "Desactivar" : "Activar"}
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
