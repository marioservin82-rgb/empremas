"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import { OPCIONES_CLASIFICACION_SIFEN } from "@/lib/sifen";

const vacio = {
  nombre: "",
  documento: "",
  clasificacionSifen: "auto",
  telefono: "",
  celular: "",
  email: "",
  direccion: "",
  lineaCredito: "",
  saldoInicial: "",
  vendedorId: "",
};

export default function NuevoCliente() {
  const router = useRouter();
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [vendedores, setVendedores] = useState([]);
  const [sifenConfigurado, setSifenConfigurado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [avisoBusqueda, setAvisoBusqueda] = useState("");

  useEffect(() => {
    apiFetch("/api/empresas/actual")
      .then((e) => {
        if (e.comisiones_habilitadas) {
          apiFetch("/api/vendedores?activo=true")
            .then(setVendedores)
            .catch(() => {});
        }
      })
      .catch(() => {});
    apiFetch("/api/empresas/sifen")
      .then((c) => setSifenConfigurado(!!c.configurado && c.via === "conector"))
      .catch(() => {});
  }, []);

  async function buscarEnDnit() {
    const numero = (form.documento || "").trim();
    if (!numero) return;
    setBuscando(true);
    setAvisoBusqueda("");
    setError("");
    try {
      const r = await apiFetch(`/api/clientes/consultar-ruc?numero=${encodeURIComponent(numero)}`);
      if (r.encontrado) {
        setForm((f) => ({
          ...f,
          nombre: r.razonSocial || f.nombre,
          documento: r.documento || f.documento,
        }));
        setAvisoBusqueda(
          `${r.razonSocial}${r.estado ? ` · ${r.estado}` : ""}. Revisá y guardá.`,
        );
      } else {
        setAvisoBusqueda("No figura en el padrón de la DNIT — cargá el nombre a mano.");
      }
    } catch (err) {
      setAvisoBusqueda(err.message);
    } finally {
      setBuscando(false);
    }
  }

  function actualizar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await apiFetch("/api/clientes", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          lineaCredito: Number(form.lineaCredito) || 0,
          saldoInicial: Number(form.saldoInicial) || 0,
        }),
      });
      router.push("/clientes");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/clientes" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-navy">Nuevo cliente</h1>
        </div>

        <form onSubmit={enviar} onKeyDown={avanzarConEnter} className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Cédula o RUC</label>
          <div className="mb-1 flex gap-2">
            <input
              value={form.documento}
              onChange={actualizar("documento")}
              className={`${campo} mb-0 flex-1`}
              placeholder="Opcional"
              autoFocus
            />
            {sifenConfigurado && (
              <button
                type="button"
                onClick={buscarEnDnit}
                disabled={buscando || !form.documento.trim()}
                className="mb-0 shrink-0 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy-2 disabled:opacity-50"
              >
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            )}
          </div>
          {avisoBusqueda ? (
            <p className="mb-4 mt-1 text-xs text-slate-500">{avisoBusqueda}</p>
          ) : (
            <p className="mb-4 mt-1 text-xs text-slate-400">
              {sifenConfigurado
                ? "Poné el número y tocá Buscar para traer el nombre del padrón de la DNIT."
                : "Cuando esté conectado con el SIFEN, este número va a completar el resto automáticamente."}
            </p>
          )}

          <label className={etiqueta}>Tipo de cliente (SIFEN)</label>
          <select value={form.clasificacionSifen} onChange={actualizar("clasificacionSifen")} className={campo}>
            {OPCIONES_CLASIFICACION_SIFEN.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
          <p className="-mt-3 mb-4 text-xs text-slate-400">
            Casi siempre &quot;Automático&quot;. Cambialo solo para un organismo del Estado o un cliente del exterior.
          </p>

          <label className={etiqueta}>Nombre y apellido</label>
          <input required value={form.nombre} onChange={actualizar("nombre")} className={campo} placeholder="Juan Pérez" />

          <label className={etiqueta}>Teléfono</label>
          <input value={form.telefono} onChange={actualizar("telefono")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Celular</label>
          <input value={form.celular} onChange={actualizar("celular")} className={campo} placeholder="Opcional, para WhatsApp" />

          <label className={etiqueta}>Email</label>
          <input type="email" value={form.email} onChange={actualizar("email")} className={campo} placeholder="Opcional, para mandarle la factura" />

          <label className={etiqueta}>Dirección</label>
          <input value={form.direccion} onChange={actualizar("direccion")} className={campo} placeholder="Opcional" />

          <label className={etiqueta}>Línea de crédito (Gs)</label>
          <input type="number" min="0" value={form.lineaCredito} onChange={actualizar("lineaCredito")} className={campo} placeholder="0" />

          <label className={etiqueta}>Saldo inicial (Gs)</label>
          <input type="number" min="0" value={form.saldoInicial} onChange={actualizar("saldoInicial")} className={campo} placeholder="0" />
          <p className="-mt-3 mb-4 text-xs text-slate-400">Si ya te debía algo antes de pasarte a EMPREMAS, cargalo acá.</p>

          {vendedores.length > 0 && (
            <>
              <label className={etiqueta}>Vendedor asignado</label>
              <select value={form.vendedorId} onChange={actualizar("vendedorId")} className={campo}>
                <option value="">— Ninguno —</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </>
          )}

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-amber-600 py-3 text-lg font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar cliente"}
          </button>
        </form>
      </div>
    </main>
  );
}
