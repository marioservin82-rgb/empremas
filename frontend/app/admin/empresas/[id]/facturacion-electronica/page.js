"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";

const ETIQUETA_ESTADO = {
  sin_configurar: { texto: "Sin configurar", clase: "bg-slate-100 text-slate-600" },
  homologacion: { texto: "En homologación", clase: "bg-amber-50 text-amber-700" },
  homologada: { texto: "Homologada", clase: "bg-sky-50 text-sky-700" },
  produccion: { texto: "En producción", clase: "bg-emerald-50 text-emerald-700" },
};

const TIPOS_DOC = [
  { tipo: 1, nombre: "Factura" },
  { tipo: 5, nombre: "Nota de Crédito" },
  { tipo: 6, nombre: "Nota de Débito" },
  { tipo: 4, nombre: "Autofactura" },
  { tipo: 7, nombre: "Nota de Remisión" },
];

// El conector quiere el .pfx en base64 puro (sin el prefijo "data:...;base64,").
function leerArchivoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(",")[1] || "");
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.readAsDataURL(archivo);
  });
}

const campo =
  "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";
const tarjeta = "mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200";
const btnPrimario =
  "w-full rounded-xl bg-slate-800 py-3 text-base font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60";

export default function AdminFacturacionElectronica() {
  const router = useRouter();
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const cargar = useCallback(
    () => adminFetch(`/api/admin/empresas/${id}/facturacion-electronica`).then(setData),
    [id],
  );

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
      return;
    }
    cargar().catch((e) => setError(e.message));
  }, [cargar, router]);

  // Polling mientras una homologación está corriendo.
  const corrida = data?.homologacion?.corrida;
  const corriendo = corrida?.estado === "corriendo";
  const refCargar = useRef(cargar);
  refCargar.current = cargar;
  useEffect(() => {
    if (!corriendo) return undefined;
    const t = setInterval(() => refCargar.current().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [corriendo]);

  if (error && !data) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando…</p>
      </main>
    );
  }

  const { empresa } = data;
  const badge = ETIQUETA_ESTADO[empresa.estado] || ETIQUETA_ESTADO.sin_configurar;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6">
          <Link href={`/admin/empresas/${id}`} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver a la empresa
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Documentos electrónicos</h1>
          <p className="text-sm text-slate-400">
            {empresa.razonSocial} · RUC {empresa.ruc}
          </p>
          <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${badge.clase}`}>
            {badge.texto}
          </span>
        </div>

        {data.avisoConector && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No se pudo contactar al conector: {data.avisoConector}
          </p>
        )}
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>}

        {empresa.estado === "sin_configurar" ? (
          <Alta id={id} onListo={cargar} setExito={setExito} setError={setError} empresa={empresa} />
        ) : (
          <>
            <DatosTenant conector={data.conector} />
            <Homologacion
              id={id}
              estado={empresa.estado}
              homologacion={data.homologacion}
              onCambio={cargar}
              setError={setError}
            />
            <Produccion
              id={id}
              estado={empresa.estado}
              onListo={cargar}
              setExito={setExito}
              setError={setError}
            />
            <DocumentosHabilitados
              id={id}
              estado={empresa.estado}
              documentos={empresa.documentos}
              onListo={cargar}
              setExito={setExito}
              setError={setError}
            />
          </>
        )}
      </div>
    </main>
  );
}

// ---------------- Alta ----------------

function Alta({ id, onListo, setExito, setError, empresa }) {
  const [rucBase, dvBase] = (empresa.ruc || "").split("-");
  const [modo, setModo] = useState("alta"); // "alta" | "vincular"

  // vincular
  const [tenantId, setTenantId] = useState("");

  // alta
  const [f, setF] = useState({
    ruc: rucBase || "",
    dvRuc: dvBase || "",
    razonSocial: empresa.razonSocial || "",
    tipoContribuyente: "1",
    establecimiento: "1",
    puntoExpedicion: "1",
    establecimientoDireccion: "",
    establecimientoNumeroCasa: "",
    establecimientoCiudad: "",
    establecimientoTelefono: "",
    establecimientoEmail: "",
    timbradoNumero: "",
    timbradoFechaInicio: "",
    timbradoFechaFin: "",
    certificadoPassword: "",
  });
  const [actividades, setActividades] = useState([{ codigo: "", descripcion: "" }]);
  const [certBase64, setCertBase64] = useState("");
  const [certNombre, setCertNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function elegirCert(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    try {
      setCertBase64(await leerArchivoBase64(archivo));
      setCertNombre(archivo.name);
    } catch (err) {
      setError(err.message);
    }
  }

  async function vincular() {
    setError("");
    setExito("");
    setGuardando(true);
    try {
      await adminFetch(`/api/admin/empresas/${id}/facturacion-electronica`, {
        method: "POST",
        body: JSON.stringify({ conectorTenantId: Number(tenantId) }),
      });
      setExito("Tenant vinculado.");
      await onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function darDeAlta(e) {
    e.preventDefault();
    setError("");
    setExito("");
    setGuardando(true);
    try {
      await adminFetch(`/api/admin/empresas/${id}/facturacion-electronica`, {
        method: "POST",
        body: JSON.stringify({
          ...f,
          tipoContribuyente: Number(f.tipoContribuyente),
          establecimientoCiudad: Number(f.establecimientoCiudad),
          actividadesEconomicas: actividades.filter((a) => a.codigo && a.descripcion),
          certificadoBase64: certBase64,
        }),
      });
      setExito("Alta creada. La empresa quedó en homologación.");
      await onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setModo("alta")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold ${modo === "alta" ? "bg-slate-800 text-white" : "bg-white text-slate-600 shadow shadow-slate-200"}`}
        >
          Alta nueva
        </button>
        <button
          onClick={() => setModo("vincular")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold ${modo === "vincular" ? "bg-slate-800 text-white" : "bg-white text-slate-600 shadow shadow-slate-200"}`}
        >
          Vincular tenant existente
        </button>
      </div>

      {modo === "vincular" ? (
        <div className={tarjeta}>
          <h2 className="mb-1 text-lg font-bold text-slate-800">Vincular un tenant del conector</h2>
          <p className="mb-4 text-sm text-slate-500">
            Si esta empresa ya fue dada de alta en el conector (p. ej. ya se homologó), poné acá el
            número de tenant.
          </p>
          <label className={etiqueta}>ID de tenant en el conector</label>
          <input
            type="number"
            min="1"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className={campo}
            placeholder="1"
          />
          <button onClick={vincular} disabled={!tenantId || guardando} className={btnPrimario}>
            {guardando ? "Vinculando…" : "Vincular"}
          </button>
        </div>
      ) : (
        <form onSubmit={darDeAlta}>
          <div className={tarjeta}>
            <h2 className="mb-4 text-lg font-bold text-slate-800">Datos del contribuyente</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={etiqueta}>RUC</label>
                <input value={f.ruc} onChange={set("ruc")} className={campo} />
              </div>
              <div>
                <label className={etiqueta}>DV</label>
                <input value={f.dvRuc} onChange={set("dvRuc")} className={campo} maxLength={1} />
              </div>
            </div>
            <label className={etiqueta}>Razón social</label>
            <input value={f.razonSocial} onChange={set("razonSocial")} className={campo} />
            <label className={etiqueta}>Tipo de contribuyente</label>
            <select value={f.tipoContribuyente} onChange={set("tipoContribuyente")} className={campo}>
              <option value="1">Persona física</option>
              <option value="2">Persona jurídica</option>
            </select>

            <label className={etiqueta}>Actividades económicas</label>
            {actividades.map((a, i) => (
              <div key={i} className="mb-2 grid grid-cols-3 gap-2">
                <input
                  className={`${campo} mb-0`}
                  placeholder="Código"
                  value={a.codigo}
                  onChange={(e) =>
                    setActividades((v) => v.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))
                  }
                />
                <input
                  className={`${campo} col-span-2 mb-0`}
                  placeholder="Descripción exacta de Marangatú"
                  value={a.descripcion}
                  onChange={(e) =>
                    setActividades((v) =>
                      v.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setActividades((v) => [...v, { codigo: "", descripcion: "" }])}
              className="mb-2 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              + Agregar actividad
            </button>
          </div>

          <div className={tarjeta}>
            <h2 className="mb-4 text-lg font-bold text-slate-800">Establecimiento</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Establecimiento</label>
                <input value={f.establecimiento} onChange={set("establecimiento")} className={campo} />
              </div>
              <div>
                <label className={etiqueta}>Punto de expedición</label>
                <input value={f.puntoExpedicion} onChange={set("puntoExpedicion")} className={campo} />
              </div>
            </div>
            <label className={etiqueta}>Dirección</label>
            <input value={f.establecimientoDireccion} onChange={set("establecimientoDireccion")} className={campo} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Nº de casa</label>
                <input value={f.establecimientoNumeroCasa} onChange={set("establecimientoNumeroCasa")} className={campo} />
              </div>
              <div>
                <label className={etiqueta}>Código de ciudad (SIFEN)</label>
                <input
                  type="number"
                  value={f.establecimientoCiudad}
                  onChange={set("establecimientoCiudad")}
                  className={campo}
                  placeholder="3609"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Teléfono</label>
                <input value={f.establecimientoTelefono} onChange={set("establecimientoTelefono")} className={campo} />
              </div>
              <div>
                <label className={etiqueta}>Email</label>
                <input value={f.establecimientoEmail} onChange={set("establecimientoEmail")} className={campo} />
              </div>
            </div>
          </div>

          <div className={tarjeta}>
            <h2 className="mb-4 text-lg font-bold text-slate-800">Timbrado y certificado (test)</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Número de timbrado</label>
                <input value={f.timbradoNumero} onChange={set("timbradoNumero")} className={campo} placeholder="8 dígitos" />
              </div>
              <div>
                <label className={etiqueta}>Inicio de vigencia</label>
                <input type="date" value={f.timbradoFechaInicio} onChange={set("timbradoFechaInicio")} className={campo} />
              </div>
            </div>
            <label className={etiqueta}>Vencimiento del timbrado (opcional)</label>
            <input type="date" value={f.timbradoFechaFin} onChange={set("timbradoFechaFin")} className={campo} />
            <p className="-mt-3 mb-3 text-xs text-slate-400">
              Dejalo vacío si el timbrado electrónico no tiene fecha de fin. La vigencia del
              certificado se lee sola del .pfx.
            </p>
            <label className={etiqueta}>Certificado .pfx</label>
            <input type="file" accept=".pfx,.p12" onChange={elegirCert} className={campo} />
            {certNombre && <p className="-mt-3 mb-3 text-xs text-emerald-600">{certNombre} cargado</p>}
            <label className={etiqueta}>Contraseña del certificado</label>
            <input
              type="password"
              value={f.certificadoPassword}
              onChange={set("certificadoPassword")}
              className={campo}
            />
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              El CSC de prueba es público (IdCSC 0001) y se completa automáticamente. El certificado y
              la contraseña se guardan cifrados en el conector, nunca en EMPREMAS.
            </p>
          </div>

          <button type="submit" disabled={guardando} className={btnPrimario}>
            {guardando ? "Creando alta…" : "Dar de alta (test)"}
          </button>
        </form>
      )}
    </>
  );
}

// ---------------- Datos del tenant ----------------

function fechaPy(v) {
  return v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
}

// Días hasta una fecha ISO (negativo = ya pasó).
function diasHasta(v) {
  if (!v) return null;
  return Math.ceil((new Date(String(v).slice(0, 10)) - new Date(new Date().toDateString())) / 86400000);
}

function DatosTenant({ conector }) {
  if (!conector) return null;
  const actividades = Array.isArray(conector.actividadesEconomicas) ? conector.actividadesEconomicas : [];
  const certDias = diasHasta(conector.certVencimiento);
  const certClase =
    certDias == null
      ? "text-slate-700"
      : certDias < 0
        ? "text-red-600 font-semibold"
        : certDias <= 30
          ? "text-amber-600 font-semibold"
          : "text-slate-700";
  const filas = [
    ["Tenant en el conector", `#${conector.id}`],
    ["RUC", conector.ruc],
    ["Razón social", conector.razonSocial],
    ["Establecimiento / Punto", `${conector.establecimiento} / ${conector.puntoExpedicion}`],
    ["Dirección fiscal", conector.establecimientoDireccion || "—"],
    ["Timbrado", conector.timbradoNumero],
    ["Inicio de vigencia", fechaPy(conector.timbradoFechaInicio)],
    ["Vencimiento del timbrado", conector.timbradoFechaFin ? fechaPy(conector.timbradoFechaFin) : "Sin vencimiento"],
    ["Ambiente", conector.ambiente],
  ];
  return (
    <div className={tarjeta}>
      <h2 className="mb-1 text-lg font-bold text-slate-800">Datos en el conector</h2>
      <p className="mb-4 text-xs text-slate-400">
        Solo lectura. Estos datos se editan en el conector y van impresos en cada factura (KuDE).
      </p>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd className="font-medium text-slate-700">{v}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="text-slate-400">Certificado de firma</dt>
          <dd className={`font-medium ${certClase}`}>
            {conector.certVencimiento
              ? `Vence ${fechaPy(conector.certVencimiento)}${
                  certDias != null && certDias < 0
                    ? " — VENCIDO"
                    : certDias != null && certDias <= 30
                      ? ` — faltan ${certDias} días`
                      : ""
                }`
              : "—"}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-slate-400">Actividad económica</dt>
          <dd className="font-medium text-slate-700">
            {actividades.length === 0
              ? "—"
              : actividades.map((a) => (
                  <span key={a.codigo} className="block">
                    {a.codigo} - {a.descripcion}
                  </span>
                ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------- Homologación ----------------

function Homologacion({ id, estado, homologacion, onCambio, setError }) {
  const [corriendo, setCorriendo] = useState(false);
  const [verReporte, setVerReporte] = useState(false);
  const c = homologacion?.corrida;

  async function correr() {
    setError("");
    setCorriendo(true);
    try {
      await adminFetch(`/api/admin/empresas/${id}/facturacion-electronica/homologacion`, {
        method: "POST",
        body: JSON.stringify({ rapido: false }),
      });
      await onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setCorriendo(false);
    }
  }

  const enCurso = c?.estado === "corriendo";

  return (
    <div className={tarjeta}>
      <h2 className="mb-1 text-lg font-bold text-slate-800">Homologación (pruebas DNIT)</h2>
      <p className="mb-4 text-sm text-slate-500">
        Corre el checklist completo (5 de cada tipo, válidos e inválidos, lotes y eventos) contra el
        ambiente de test. Tarda ~15–20 minutos.
      </p>

      {!c && <p className="mb-4 text-sm text-slate-400">Todavía no se corrió ninguna homologación.</p>}

      {c && (
        <div className="mb-4 rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">
              {enCurso && "⏳ Corriendo…"}
              {c.estado === "ok" && "✅ Aprobada"}
              {c.estado === "fallo" && "⚠️ Con observaciones"}
              {c.estado === "error" && "❌ Error al correr"}
            </span>
            <span className="text-slate-400">
              {new Date(String(c.iniciadoEn).replace(" ", "T") + "Z").toLocaleString("es-PY")}
            </span>
          </div>
          {c.resumen && <p className="mt-1 text-slate-600">{c.resumen}</p>}
          {c.fallos?.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-700">
              {c.fallos.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          {c.reporteMarkdown && (
            <button
              onClick={() => setVerReporte((v) => !v)}
              className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              {verReporte ? "Ocultar reporte" : "Ver reporte completo"}
            </button>
          )}
          {verReporte && c.reporteMarkdown && (
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {c.reporteMarkdown}
            </pre>
          )}
        </div>
      )}

      <button onClick={correr} disabled={corriendo || enCurso || estado === "produccion"} className={btnPrimario}>
        {enCurso ? "Corriendo…" : c ? "Volver a correr" : "Correr homologación"}
      </button>
    </div>
  );
}

// ---------------- Pase a producción ----------------

function Produccion({ id, estado, onListo, setExito, setError }) {
  const [f, setF] = useState({ timbradoNumero: "", timbradoFechaInicio: "", timbradoFechaFin: "", idCsc: "", csc: "" });
  const [numeros, setNumeros] = useState({});
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  const habilitado = estado === "homologada" || estado === "produccion";
  const yaEnProd = estado === "produccion";

  async function pasar(e) {
    e.preventDefault();
    if (!window.confirm("¿Pasar esta empresa a PRODUCCIÓN? A partir de ahora sus facturas tienen valor legal.")) return;
    setError("");
    setExito("");
    setGuardando(true);
    try {
      const numerosIniciales = {};
      for (const [tipo, val] of Object.entries(numeros)) {
        if (val !== "" && val != null) numerosIniciales[tipo] = Number(val);
      }
      const cuerpo = { ...f, numerosIniciales };
      // Solo se manda el vencimiento del timbrado si se completó — así no se
      // borra un valor ya guardado al reeditar los datos de producción.
      if (!f.timbradoFechaFin) delete cuerpo.timbradoFechaFin;
      await adminFetch(`/api/admin/empresas/${id}/facturacion-electronica`, {
        method: "PATCH",
        body: JSON.stringify(cuerpo),
      });
      setExito("Empresa en producción.");
      await onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={`${tarjeta} ${habilitado ? "" : "opacity-60"}`}>
      <h2 className="mb-1 text-lg font-bold text-slate-800">Pase a producción</h2>
      {!habilitado ? (
        <p className="text-sm text-slate-500">
          Disponible cuando la homologación esté aprobada.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            Cargá el timbrado y el CSC <strong>reales</strong> de producción. Si la empresa venía
            facturando con otro sistema, poné el último número emitido por tipo para que la numeración
            continúe sin saltos.
          </p>
          <form onSubmit={pasar}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Timbrado de producción</label>
                <input value={f.timbradoNumero} onChange={set("timbradoNumero")} className={campo} />
              </div>
              <div>
                <label className={etiqueta}>Inicio de vigencia</label>
                <input type="date" value={f.timbradoFechaInicio} onChange={set("timbradoFechaInicio")} className={campo} />
              </div>
            </div>
            <label className={etiqueta}>Vencimiento del timbrado (opcional)</label>
            <input type="date" value={f.timbradoFechaFin} onChange={set("timbradoFechaFin")} className={campo} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>IdCSC</label>
                <input value={f.idCsc} onChange={set("idCsc")} className={campo} placeholder="0001" />
              </div>
              <div>
                <label className={etiqueta}>CSC</label>
                <input value={f.csc} onChange={set("csc")} className={campo} />
              </div>
            </div>

            <label className={etiqueta}>Último número emitido por tipo (opcional, migración)</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {TIPOS_DOC.map((t) => (
                <div key={t.tipo}>
                  <span className="text-xs text-slate-400">{t.nombre}</span>
                  <input
                    type="number"
                    min="0"
                    value={numeros[t.tipo] ?? ""}
                    onChange={(e) => setNumeros((v) => ({ ...v, [t.tipo]: e.target.value }))}
                    className={`${campo} mb-0`}
                  />
                </div>
              ))}
            </div>

            <button type="submit" disabled={guardando} className={btnPrimario}>
              {guardando ? "Aplicando…" : yaEnProd ? "Actualizar datos de producción" : "Activar producción"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

// ---------------- Documentos habilitados (plus del plan) ----------------

function DocumentosHabilitados({ id, estado, documentos, onListo, setExito, setError }) {
  const [d, setD] = useState({
    remision: !!documentos?.remision,
    nc_nd: !!documentos?.nc_nd,
    autofactura: !!documentos?.autofactura,
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setD({
      remision: !!documentos?.remision,
      nc_nd: !!documentos?.nc_nd,
      autofactura: !!documentos?.autofactura,
    });
  }, [documentos]);

  const habilitado = estado === "homologada" || estado === "produccion";

  async function guardar() {
    setError("");
    setExito("");
    setGuardando(true);
    try {
      await adminFetch(`/api/admin/empresas/${id}/documentos-habilitados`, {
        method: "PUT",
        body: JSON.stringify(d),
      });
      setExito("Documentos habilitados actualizados.");
      await onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const fila = (clave, titulo, detalle) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
      <input
        type="checkbox"
        checked={d[clave]}
        onChange={(e) => setD((v) => ({ ...v, [clave]: e.target.checked }))}
        className="mt-1 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{titulo}</span>
        <span className="block text-xs text-slate-500">{detalle}</span>
      </span>
    </label>
  );

  return (
    <div className={`${tarjeta} ${habilitado ? "" : "opacity-60"}`}>
      <h2 className="mb-1 text-lg font-bold text-slate-800">Documentos habilitados</h2>
      {!habilitado ? (
        <p className="text-sm text-slate-500">Disponible cuando la empresa esté homologada.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            La <strong>Factura</strong> va incluida. El resto son un plus del plan — activá lo que
            contrató el cliente.
          </p>
          <div className="mb-4 flex flex-col gap-2">
            {fila("remision", "Nota de Remisión", "Traslado de mercadería. Incluye remisión primero y factura al confirmar la entrega.")}
            {fila("nc_nd", "Notas de Crédito y Débito", "Ajustes sobre una factura ya emitida.")}
            {fila("autofactura", "Autofactura", "Compra a un no contribuyente.")}
          </div>
          <button onClick={guardar} disabled={guardando} className={btnPrimario}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </>
      )}
    </div>
  );
}
