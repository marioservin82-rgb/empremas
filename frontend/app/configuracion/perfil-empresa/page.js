"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

function estadoCertificado(vencimiento) {
  if (!vencimiento) return { texto: "No cargado", clase: "bg-slate-100 text-slate-500" };
  const vencido = new Date(vencimiento) < new Date(new Date().toDateString());
  return vencido
    ? { texto: "Vencido", clase: "bg-red-50 text-red-700" }
    : { texto: "Vigente", clase: "bg-emerald-50 text-emerald-700" };
}

export default function PerfilEmpresa() {
  const router = useRouter();
  const [yo, setYo] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [sucursales, setSucursales] = useState([]);

  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [direccion, setDireccion] = useState("");
  const [direccionAtencion, setDireccionAtencion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [certVencimiento, setCertVencimiento] = useState("");
  const [certNota, setCertNota] = useState("");

  const [logo, setLogo] = useState(null);
  const [logoNuevo, setLogoNuevo] = useState(null);
  const [errorLogo, setErrorLogo] = useState("");
  const [exitoLogo, setExitoLogo] = useState(false);
  const [guardandoLogo, setGuardandoLogo] = useState(false);

  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [produccionHabilitada, setProduccionHabilitada] = useState(false);
  const [sugerenciasVentaHabilitadas, setSugerenciasVentaHabilitadas] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        setYo(u);
        if (u.rol !== "dueno") router.push("/panel");
      })
      .catch(() => router.push("/panel"));
    apiFetch("/api/empresas/actual")
      .then((e) => {
        setEmpresa(e);
        setRazonSocial(e.razon_social || "");
        setRuc(e.ruc || "");
        setDireccion(e.direccion || "");
        setDireccionAtencion(e.direccion_atencion || "");
        setTelefono(e.telefono || "");
        setEmail(e.email || "");
        setCertVencimiento(e.sifen_cert_vencimiento ? e.sifen_cert_vencimiento.slice(0, 10) : "");
        setCertNota(e.sifen_cert_nota || "");
        setProduccionHabilitada(!!e.produccion_habilitada);
        setSugerenciasVentaHabilitadas(e.sugerencias_venta_habilitadas !== false);
      })
      .catch((err) => setError(err.message));
    apiFetch("/api/sucursales")
      .then(setSucursales)
      .catch(() => {});
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

  async function cambiarProduccionHabilitada(valor) {
    setProduccionHabilitada(valor);
    try {
      await apiFetch("/api/empresas/actual", {
        method: "PATCH",
        body: JSON.stringify({ produccionHabilitada: valor }),
      });
    } catch (err) {
      setProduccionHabilitada(!valor);
      setError(err.message);
    }
  }

  async function cambiarSugerenciasVenta(valor) {
    setSugerenciasVentaHabilitadas(valor);
    try {
      await apiFetch("/api/empresas/actual", {
        method: "PATCH",
        body: JSON.stringify({ sugerenciasVentaHabilitadas: valor }),
      });
    } catch (err) {
      setSugerenciasVentaHabilitadas(!valor);
      setError(err.message);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setExito(false);
    setGuardando(true);
    try {
      const actualizado = await apiFetch("/api/empresas/actual", {
        method: "PATCH",
        body: JSON.stringify({
          razonSocial,
          ruc,
          direccion,
          direccionAtencion: direccionAtencion || null,
          telefono: telefono || null,
          email: email || null,
          sifenCertVencimiento: certVencimiento || null,
          sifenCertNota: certNota || null,
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

  if (!yo || !empresa) {
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

  const cert = estadoCertificado(empresa.sifen_cert_vencimiento);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-sm">
        <div className="py-6">
          <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Mi Empresa</h1>
          <p className="mt-1 text-sm text-slate-500">Datos fiscales, de contacto e identidad de tu comercio.</p>
        </div>

        <form onSubmit={guardar}>
          <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Datos fiscales</h2>

            <label className={etiqueta}>Razón social</label>
            <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} className={campo} required />

            <label className={etiqueta}>RUC</label>
            <input value={ruc} onChange={(e) => setRuc(e.target.value)} className={campo} required />

            <label className={etiqueta}>Dirección fiscal</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={campo} />

            {empresa.datos_fiscales_modificado_en && (
              <p className="mb-4 text-xs text-slate-400">
                Última modificación de razón social/RUC: {new Date(empresa.datos_fiscales_modificado_en).toLocaleString("es-PY")}
              </p>
            )}

            {sucursales.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Puntos de expedición por sucursal</p>
                <div className="flex flex-col gap-1">
                  {sucursales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{s.nombre}</span>
                      <span className="font-mono text-slate-500">{s.punto_expedicion || "— sin configurar"}</span>
                    </div>
                  ))}
                </div>
                <Link href="/sucursales" className="mt-2 inline-block text-sm font-semibold text-navy hover:text-brand">
                  Editar en Sucursales →
                </Link>
              </div>
            )}
          </div>

          <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Datos de contacto</h2>

            <label className={etiqueta}>Teléfono / WhatsApp</label>
            <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={campo} placeholder="0981234567" />

            <label className={etiqueta}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} placeholder="contacto@tucomercio.com" />

            <label className={etiqueta}>Dirección de atención al público</label>
            <input
              value={direccionAtencion}
              onChange={(e) => setDireccionAtencion(e.target.value)}
              className={campo}
              placeholder="Si es distinta a la dirección fiscal"
            />
          </div>

          <div className="mb-6 flex items-center justify-between rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <div>
              <p className="font-semibold text-slate-800">Módulo de Producción</p>
              <p className="text-sm text-slate-400">
                Para negocios que fabrican (ladrillera, chipería...): insumos, recetas, órdenes de producción y
                costo real por unidad. Si está apagado, no aparece en ningún lado de la app.
              </p>
            </div>
            <button
              type="button"
              onClick={() => cambiarProduccionHabilitada(!produccionHabilitada)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                produccionHabilitada ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  produccionHabilitada ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="mb-6 flex items-center justify-between rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <div>
              <p className="font-semibold text-slate-800">Sugerencias inteligentes en Vender</p>
              <p className="text-sm text-slate-400">
                Al agregar un producto o elegir un cliente, muestra qué se compra junto y qué suele llevar ese
                cliente. Si te resulta molesto para vender rápido, podés apagarlo acá.
              </p>
            </div>
            <button
              type="button"
              onClick={() => cambiarSugerenciasVenta(!sugerenciasVentaHabilitadas)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                sugerenciasVentaHabilitadas ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  sugerenciasVentaHabilitadas ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
            <h2 className="mb-1 text-lg font-bold text-slate-800">Certificado digital SIFEN</h2>
            <p className="mb-4 text-sm text-slate-500">
              Registro informativo — el certificado que firma tus documentos se carga directamente en Sifende, no acá.
            </p>

            <span className={`mb-4 inline-block rounded-full px-3 py-1 text-sm font-semibold ${cert.clase}`}>{cert.texto}</span>

            <label className={etiqueta}>Fecha de vencimiento</label>
            <input type="date" value={certVencimiento} onChange={(e) => setCertVencimiento(e.target.value)} className={campo} />

            <label className={etiqueta}>Nota (opcional)</label>
            <input value={certNota} onChange={(e) => setCertNota(e.target.value)} className={campo} placeholder="Ej: renovado en Sifende, entidad emisora, etc." />
          </div>

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-1 text-lg font-bold text-slate-800">Logo del comercio</h2>
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
          {exitoLogo && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Logo guardado.</p>}

          <div className="flex gap-2">
            <button
              onClick={guardarLogo}
              disabled={!logoNuevo || guardandoLogo}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
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
