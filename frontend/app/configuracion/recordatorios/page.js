"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PLANTILLAS_POR_DEFECTO } from "@/lib/recordatorios";

const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";
const textareaClase = "mb-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

const PLANTILLAS = [
  { clave: "previo", etiqueta: "Recordatorio previo (antes del vencimiento)" },
  { clave: "hoy", etiqueta: "Vence hoy" },
  { clave: "mora_leve", etiqueta: "Vencida, mora leve (1 a 7 días)" },
  { clave: "mora_prolongada", etiqueta: "Vencida, mora prolongada" },
];

export default function ConfiguracionRecordatorios() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState(null);

  const [diasAvisoPrevio, setDiasAvisoPrevio] = useState("3");
  const [diasMoraProlongada, setDiasMoraProlongada] = useState("7");
  const [incluirRuc, setIncluirRuc] = useState(true);
  const [incluirTelefono, setIncluirTelefono] = useState(true);
  const [mensajes, setMensajes] = useState({ ...PLANTILLAS_POR_DEFECTO });

  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        if (u.rol !== "dueno") router.push("/panel");
      })
      .catch(() => router.push("/panel"));
    apiFetch("/api/empresas/actual")
      .then((e) => {
        setEmpresa(e);
        setDiasAvisoPrevio(String(e.recordatorio_dias_aviso_previo));
        setDiasMoraProlongada(String(e.recordatorio_dias_mora_prolongada));
        setIncluirRuc(e.recordatorio_incluir_ruc);
        setIncluirTelefono(e.recordatorio_incluir_telefono);
        setMensajes({
          previo: e.recordatorio_mensaje_previo || PLANTILLAS_POR_DEFECTO.previo,
          hoy: e.recordatorio_mensaje_hoy || PLANTILLAS_POR_DEFECTO.hoy,
          mora_leve: e.recordatorio_mensaje_mora_leve || PLANTILLAS_POR_DEFECTO.mora_leve,
          mora_prolongada: e.recordatorio_mensaje_mora_prolongada || PLANTILLAS_POR_DEFECTO.mora_prolongada,
        });
      })
      .catch((err) => setError(err.message));
  }, [router]);

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setExito(false);
    setGuardando(true);
    try {
      const actualizado = await apiFetch("/api/empresas/actual", {
        method: "PATCH",
        body: JSON.stringify({
          recordatorioDiasAvisoPrevio: Number(diasAvisoPrevio),
          recordatorioDiasMoraProlongada: Number(diasMoraProlongada),
          recordatorioIncluirRuc: incluirRuc,
          recordatorioIncluirTelefono: incluirTelefono,
          recordatorioMensajePrevio: mensajes.previo,
          recordatorioMensajeHoy: mensajes.hoy,
          recordatorioMensajeMoraLeve: mensajes.mora_leve,
          recordatorioMensajeMoraProlongada: mensajes.mora_prolongada,
        }),
      });
      setEmpresa((actual) => ({ ...actual, ...actualizado }));
      setExito(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!empresa) return null;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Recordatorios de pago</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cuándo aparece el botón "Recordar pago" en Fiado/Crédito y qué dice cada mensaje.
          </p>
        </div>

        <form onSubmit={guardar} className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Cuándo avisar</p>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Días de anticipación (antes de vencer)</label>
              <input
                type="number"
                min="0"
                value={diasAvisoPrevio}
                onChange={(e) => setDiasAvisoPrevio(e.target.value)}
                className={campo}
              />
            </div>
            <div>
              <label className={etiqueta}>Días para considerar mora prolongada</label>
              <input
                type="number"
                min="0"
                value={diasMoraProlongada}
                onChange={(e) => setDiasMoraProlongada(e.target.value)}
                className={campo}
              />
            </div>
          </div>

          <p className="mb-3 font-semibold text-slate-700">Qué mostrar del comercio</p>
          <div className="mb-6 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={incluirRuc} onChange={(e) => setIncluirRuc(e.target.checked)} />
              Incluir el RUC del comercio en el mensaje
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={incluirTelefono}
                onChange={(e) => setIncluirTelefono(e.target.checked)}
              />
              Incluir el teléfono del comercio en el mensaje
            </label>
          </div>

          <p className="mb-3 font-semibold text-slate-700">Plantillas de mensaje</p>
          <p className="mb-4 text-xs text-slate-400">
            Placeholders disponibles: [Nombre], [Nombre del comercio], [RUC del comercio], [Número], [Monto],
            [Fecha de vencimiento], [Saldo total], [Teléfono del comercio]. Se completan solos con los datos de
            cada cliente.
          </p>
          {PLANTILLAS.map((p) => (
            <div key={p.clave} className="mb-4">
              <label className={etiqueta}>{p.etiqueta}</label>
              <textarea
                value={mensajes[p.clave]}
                onChange={(e) => setMensajes((actual) => ({ ...actual, [p.clave]: e.target.value }))}
                rows={4}
                className={textareaClase}
              />
            </div>
          ))}

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {exito && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </div>
    </main>
  );
}
