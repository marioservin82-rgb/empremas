"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function ConfiguracionSifen() {
  const router = useRouter();
  const [config, setConfig] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [establecimiento, setEstablecimiento] = useState(1);
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [logo, setLogo] = useState(null);
  const [logoNuevo, setLogoNuevo] = useState(null);
  const [errorLogo, setErrorLogo] = useState("");
  const [exitoLogo, setExitoLogo] = useState(false);
  const [guardandoLogo, setGuardandoLogo] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/sifen")
      .then((c) => {
        setConfig(c);
        setEstablecimiento(c.establecimiento);
        setTelefono(c.telefono || "");
        setDireccion(c.direccion || "");
      })
      .catch((err) => setError(err.message));
    apiFetch("/api/empresas/logo")
      .then((r) => setLogo(r.logo))
      .catch(() => {});
  }, [router]);

  function elegirLogo(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrorLogo("");
    setExitoLogo(false);
    const lector = new FileReader();
    lector.onload = () => setLogoNuevo(lector.result);
    lector.readAsDataURL(archivo);
  }

  async function guardarLogo() {
    setErrorLogo("");
    setExitoLogo(false);
    setGuardandoLogo(true);
    try {
      const respuesta = await apiFetch("/api/empresas/logo", {
        method: "PATCH",
        body: JSON.stringify({ logo: logoNuevo }),
      });
      setLogo(respuesta.logo);
      setLogoNuevo(null);
      setExitoLogo(true);
    } catch (err) {
      setErrorLogo(err.message);
    } finally {
      setGuardandoLogo(false);
    }
  }

  async function quitarLogo() {
    setErrorLogo("");
    setExitoLogo(false);
    setGuardandoLogo(true);
    try {
      const respuesta = await apiFetch("/api/empresas/logo", {
        method: "PATCH",
        body: JSON.stringify({ logo: null }),
      });
      setLogo(respuesta.logo);
      setLogoNuevo(null);
    } catch (err) {
      setErrorLogo(err.message);
    } finally {
      setGuardandoLogo(false);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setExito(false);
    setGuardando(true);
    try {
      const body = {
        establecimiento: Number(establecimiento),
        telefono: telefono || undefined,
        direccion: direccion || undefined,
      };
      if (apiKey) body.apiKey = apiKey;
      const actualizado = await apiFetch("/api/empresas/sifen", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setConfig(actualizado);
      setApiKey("");
      setExito(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  if (!config) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-slate-500">Cargando...</p>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-sm">
        <div className="py-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Facturación electrónica</h1>
          <p className="mt-1 text-sm text-slate-500">
            Conectá EMPREMAS con Sifende para poder emitir Factura Legal (SIFEN).
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
          {config.configurado ? (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              SIFEN configurado — key terminada en ····{config.ultimosDigitos}
            </p>
          ) : (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Todavía no configuraste SIFEN — el botón "Factura Legal" sigue deshabilitado en Vender.
            </p>
          )}

          <form onSubmit={guardar}>
            <label className={etiqueta}>API key de Sifende</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={campo}
              placeholder={config.configurado ? "Dejalo vacío para no cambiarla" : "sk_test_..."}
            />

            <label className={etiqueta}>Número de establecimiento</label>
            <input
              type="number"
              min="1"
              value={establecimiento}
              onChange={(e) => setEstablecimiento(e.target.value)}
              className={campo}
            />

            <label className={etiqueta}>Dirección de la empresa</label>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className={campo}
              placeholder="Villa Hayes"
            />

            <label className={etiqueta}>Teléfono de la empresa</label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={campo}
              placeholder="0981234567"
            />

            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {exito && (
              <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="w-full rounded-xl bg-blue-700 py-3 text-lg font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-1 text-lg font-bold text-slate-800">Logo de la empresa</h2>
          <p className="mb-4 text-sm text-slate-500">Aparece en la Factura Legal (SIFEN).</p>

          {(logoNuevo || logo) && (
            <img
              src={logoNuevo || logo}
              alt="Logo de la empresa"
              className="mb-4 max-h-32 rounded-xl border border-slate-200 object-contain p-2"
            />
          )}

          <input type="file" accept="image/*" onChange={elegirLogo} className={campo} />

          {errorLogo && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorLogo}</p>}
          {exitoLogo && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Logo guardado.</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={guardarLogo}
              disabled={!logoNuevo || guardandoLogo}
              className="flex-1 rounded-xl bg-blue-700 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              {guardandoLogo ? "Guardando..." : "Guardar logo"}
            </button>
            {logo && (
              <button
                onClick={quitarLogo}
                disabled={guardandoLogo}
                className="rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-600 hover:bg-red-100 disabled:opacity-60"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
