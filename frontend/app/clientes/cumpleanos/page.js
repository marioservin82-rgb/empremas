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
  // Mismo criterio que el resto de la app: una fecha "suelta" (sin hora)
  // se fuerza a hora local para no correrse un dia en husos negativos.
  return new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY", { day: "2-digit", month: "long" });
}

function mensajePorDefecto(nombreCliente, nombreEmpresa) {
  return `¡Feliz cumpleaños, ${nombreCliente}! 🎉 De parte de todo el equipo de ${nombreEmpresa}, te deseamos un día espectacular. Como regalito, tenemos algo especial para vos — pasate por acá cuando quieras.`;
}

export default function CumpleanosClientes() {
  const router = useRouter();
  const [rango, setRango] = useState("semana");
  const [clientes, setClientes] = useState(null);
  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [error, setError] = useState("");

  const [abiertoId, setAbiertoId] = useState(null);
  const [texto, setTexto] = useState("");
  const [copiadoId, setCopiadoId] = useState(null);

  function cargar(r) {
    setError("");
    apiFetch(`/api/clientes/cumpleanos?rango=${r}`)
      .then(setClientes)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((yo) => {
        if (yo.rol !== "dueno" && yo.rol !== "encargado") {
          router.push("/panel");
        }
      })
      .catch(() => {});
    apiFetch("/api/empresas/actual").then(setEmpresaInfo).catch(() => {});
    cargar(rango);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function cambiarRango(r) {
    setRango(r);
    setAbiertoId(null);
    cargar(r);
  }

  function abrir(cliente) {
    setAbiertoId(cliente.id);
    setTexto(mensajePorDefecto(cliente.nombre, empresaInfo?.nombre_fantasia || empresaInfo?.razon_social || "nosotros"));
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
          <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Cumpleaños de clientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Para ofrecerles algo especial ese día — el mensaje es solo una base, editalo como quieras antes de mandarlo.
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

        {clientes === null ? (
          <p className="text-slate-500">Cargando...</p>
        ) : clientes.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-slate-500 shadow shadow-slate-200">
            Nadie cumple años en este período — o todavía no cargaste fechas de nacimiento en las fichas de tus
            clientes.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {clientes.map((c) => {
              const abierto = abiertoId === c.id;
              return (
                <div key={c.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-bold text-slate-800">
                        {c.nombre} {c.cumpleHoy && <span className="text-xl">🎂</span>}
                      </p>
                      <p className="text-sm text-slate-400">
                        {fecha(c.fechaNacimiento)} · cumple {c.edadCumple} años
                        {c.cumpleHoy ? " · hoy" : ` · en ${c.diasFaltan} día${c.diasFaltan === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <button
                      onClick={() => (abierto ? setAbiertoId(null) : abrir(c))}
                      className="shrink-0 text-sm font-semibold text-brand hover:text-navy"
                    >
                      {abierto ? "Cerrar" : "Saludar"}
                    </button>
                  </div>

                  {abierto && (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <p className="mb-2 text-sm font-medium text-slate-500">Mensaje — podés editarlo antes de mandarlo</p>
                      <textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        rows={5}
                        className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                      />
                      <div className="flex flex-wrap gap-2">
                        {c.celular ? (
                          <a
                            href={linkWhatsapp(c.celular, texto)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700"
                          >
                            Enviar por WhatsApp
                          </a>
                        ) : (
                          <p className="text-sm text-slate-400">
                            Este cliente no tiene celular cargado — usá "Copiar mensaje" para mandarlo por otro medio.
                          </p>
                        )}
                        <button
                          onClick={() => copiar(c.id)}
                          className="rounded-xl bg-slate-100 px-5 py-2 font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          {copiadoId === c.id ? "¡Copiado!" : "Copiar mensaje"}
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
