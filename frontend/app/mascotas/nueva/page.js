"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";

const ESPECIES_SUGERIDAS = ["Perro", "Gato", "Ave", "Otro"];

// useSearchParams() exige un limite de Suspense arriba, mismo criterio ya
// usado en citas/nueva y gastos/salida-stock.
export default function NuevaMascota() {
  return (
    <Suspense fallback={null}>
      <NuevaMascotaContenido />
    </Suspense>
  );
}

function NuevaMascotaContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [cliente, setCliente] = useState(null);

  const [nombre, setNombre] = useState("");
  const [especie, setEspecie] = useState("");
  const [raza, setRaza] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [sexo, setSexo] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [notas, setNotas] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    const clienteIdPrecargado = searchParams.get("clienteId");
    if (clienteIdPrecargado) {
      apiFetch(`/api/clientes/${clienteIdPrecargado}`)
        .then(setCliente)
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function ejecutarBusquedaCliente(q) {
    if (!q) return setResultadosCliente([]);
    try {
      setResultadosCliente(await apiFetch(`/api/clientes?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }
  const busquedaClienteDebounced = useDebounced(busquedaCliente);
  useEffect(() => {
    ejecutarBusquedaCliente(busquedaClienteDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaClienteDebounced]);

  const puedeConfirmar = cliente && nombre.trim() && especie.trim();

  async function confirmar() {
    setError("");
    setEnviando(true);
    try {
      const mascota = await apiFetch("/api/mascotas", {
        method: "POST",
        body: JSON.stringify({
          clienteId: cliente.id,
          nombre: nombre.trim(),
          especie: especie.trim(),
          raza: raza || undefined,
          fechaNacimiento: fechaNacimiento || undefined,
          sexo: sexo || undefined,
          pesoKg: pesoKg ? Number(pesoKg) : undefined,
          notas: notas || undefined,
        }),
      });
      router.push(`/mascotas/${mascota.id}`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="py-6">
          <Link href="/mascotas" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Nueva mascota</h1>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 font-semibold text-slate-700">Dueño</p>
          {cliente ? (
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">{cliente.nombre}</p>
              <button onClick={() => setCliente(null)} className="text-sm font-medium text-red-500 hover:text-red-700">
                Quitar
              </button>
            </div>
          ) : (
            <div>
              <input
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                placeholder="Buscar por nombre, cédula o RUC..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              {resultadosCliente.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {resultadosCliente.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCliente(c);
                        setResultadosCliente([]);
                        setBusquedaCliente("");
                      }}
                      className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold">{c.nombre}</span>{" "}
                      <span className="text-sm text-slate-400">{c.documento}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                ¿El dueño no está cargado?{" "}
                <Link href="/clientes/nuevo" className="font-semibold text-navy hover:text-brand">
                  Creá el cliente
                </Link>{" "}
                y volvé acá.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200" onKeyDown={avanzarConEnter}>
          <label className={etiqueta}>Nombre de la mascota</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} autoFocus />

          <label className={etiqueta}>Especie</label>
          <input
            value={especie}
            onChange={(e) => setEspecie(e.target.value)}
            className={campo}
            placeholder="Perro, gato, ave..."
          />
          <div className="-mt-3 mb-4 flex flex-wrap gap-2">
            {ESPECIES_SUGERIDAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setEspecie(s)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                {s}
              </button>
            ))}
          </div>

          <label className={etiqueta}>Raza (opcional)</label>
          <input value={raza} onChange={(e) => setRaza(e.target.value)} className={campo} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Fecha de nacimiento (opcional)</label>
              <input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-navy"
              />
            </div>
            <div>
              <label className={etiqueta}>Peso en kg (opcional)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={pesoKg}
                onChange={(e) => setPesoKg(e.target.value)}
                className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-navy"
              />
            </div>
          </div>

          <label className={etiqueta}>Sexo (opcional)</label>
          <select value={sexo} onChange={(e) => setSexo(e.target.value)} className={campo}>
            <option value="">Sin especificar</option>
            <option value="macho">Macho</option>
            <option value="hembra">Hembra</option>
          </select>

          <label className={etiqueta}>Notas (alergias, condiciones crónicas, opcional)</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="mb-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
        </div>

        <button
          onClick={confirmar}
          disabled={!puedeConfirmar || enviando}
          className="mt-4 w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
        >
          {enviando ? "Guardando..." : "Registrar mascota"}
        </button>
      </div>
    </main>
  );
}
