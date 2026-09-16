"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { linkWhatsapp } from "@/lib/whatsapp";

const RANGOS = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
];

function fecha(f) {
  return new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY", { day: "2-digit", month: "long" });
}

function mensajePorDefecto(v, nombreEmpresa) {
  return `Hola ${v.clienteNombre}, te escribimos de ${nombreEmpresa} — a ${v.mascotaNombre} le corresponde el refuerzo de ${v.nombreVacuna}${
    v.vencida ? " (ya venció, te recomendamos ponerlo al día)" : ` el ${fecha(v.fechaProximoRefuerzo)}`
  }. ¿Coordinamos un turno?`;
}

export default function VacunasPorVencer() {
  const router = useRouter();
  const [rango, setRango] = useState("semana");
  const [vacunas, setVacunas] = useState(null);
  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [error, setError] = useState("");

  const [abiertoId, setAbiertoId] = useState(null);
  const [texto, setTexto] = useState("");
  const [copiadoId, setCopiadoId] = useState(null);

  function cargar(r) {
    setError("");
    apiFetch(`/api/mascotas/vacunas-por-vencer?rango=${r}`)
      .then(setVacunas)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/actual").then(setEmpresaInfo).catch(() => {});
    cargar(rango);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function cambiarRango(r) {
    setRango(r);
    setAbiertoId(null);
    cargar(r);
  }

  function abrir(v) {
    setAbiertoId(v.id);
    setTexto(mensajePorDefecto(v, empresaInfo?.nombre_fantasia || empresaInfo?.razon_social || "nosotros"));
    setCopiadoId(null);
  }

  async function copiar(id) {
    await navigator.clipboard.writeText(texto);
    setCopiadoId(id);
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/mascotas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Refuerzos de vacunas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Próximos refuerzos según lo cargado en cada ficha — incluye los que ya vencieron.
          </p>
        </div>

        <div className="mb-4 flex gap-2">
          {RANGOS.map((r) => (
            <button
              key={r.valor}
              onClick={() => cambiarRango(r.valor)}
              className={`flex-1 rounded-xl py-3 font-semibold transition ${
                rango === r.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {vacunas === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : vacunas.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-slate-500 shadow shadow-slate-200">
            Sin refuerzos por vencer en este período.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {vacunas.map((v) => {
              const abierto = abiertoId === v.id;
              return (
                <div key={v.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-bold text-slate-800">
                        {v.mascotaNombre} <span className="text-sm font-normal text-slate-400">· {v.mascotaEspecie}</span>
                      </p>
                      <p className="text-sm text-slate-500">
                        {v.nombreVacuna} · {v.clienteNombre}
                      </p>
                      <p className={`text-sm font-semibold ${v.vencida ? "text-red-600" : "text-amber-600"}`}>
                        {v.vencida
                          ? `Venció hace ${Math.abs(v.diasFaltan)} día${Math.abs(v.diasFaltan) === 1 ? "" : "s"}`
                          : v.diasFaltan === 0
                          ? "Vence hoy"
                          : `Vence en ${v.diasFaltan} día${v.diasFaltan === 1 ? "" : "s"} (${fecha(v.fechaProximoRefuerzo)})`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link href={`/mascotas/${v.mascotaId}`} className="text-sm font-semibold text-navy hover:text-brand">
                        Ver ficha
                      </Link>
                      <button
                        onClick={() => (abierto ? setAbiertoId(null) : abrir(v))}
                        className="text-sm font-semibold text-brand hover:text-navy"
                      >
                        {abierto ? "Cerrar" : "Avisar"}
                      </button>
                    </div>
                  </div>

                  {abierto && (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <p className="mb-2 text-sm font-medium text-slate-500">Mensaje — podés editarlo antes de mandarlo</p>
                      <textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        rows={4}
                        className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                      />
                      <div className="flex flex-wrap gap-2">
                        {v.clienteCelular ? (
                          <a
                            href={linkWhatsapp(v.clienteCelular, texto)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700"
                          >
                            Enviar por WhatsApp
                          </a>
                        ) : (
                          <p className="text-sm text-slate-400">Sin celular cargado — usá "Copiar mensaje".</p>
                        )}
                        <button
                          onClick={() => copiar(v.id)}
                          className="rounded-xl bg-slate-100 px-5 py-2 font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          {copiadoId === v.id ? "¡Copiado!" : "Copiar mensaje"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
