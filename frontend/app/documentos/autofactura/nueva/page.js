"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";

const campo =
  "mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";
const formatoGs = new Intl.NumberFormat("es-PY");

const NATURALEZAS = [
  { v: 1, t: "No contribuyente (sin RUC)" },
  { v: 2, t: "Extranjero" },
];
const DOC_TIPOS = [
  { v: 1, t: "Cédula paraguaya" },
  { v: 2, t: "Pasaporte" },
  { v: 3, t: "Cédula extranjera" },
  { v: 4, t: "Carnet de residencia" },
];
const CONSTANCIAS = [
  { v: 1, t: "Constancia de no ser contribuyente" },
  { v: 2, t: "Constancia de microproductores" },
];
const TIPO_TRANSACCION = [
  { v: 10, t: "Compra de productos" },
  { v: 11, t: "Compra de servicios" },
];

// Buscador del catálogo geográfico de SIFEN (ciudad → código).
function BuscadorCiudad({ valor, onSelect, placeholder }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const qDeb = useDebounced(q);

  useEffect(() => {
    if (!qDeb || qDeb.length < 2) return setResultados([]);
    apiFetch(`/api/autofacturas/ciudades?q=${encodeURIComponent(qDeb)}`)
      .then((r) => setResultados(r.ciudades || []))
      .catch(() => setResultados([]));
  }, [qDeb]);

  if (valor) {
    return (
      <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">
          {valor.ciudad} <span className="font-normal text-slate-400">· {valor.distrito}, {valor.departamento}</span>
        </span>
        <button type="button" onClick={() => onSelect(null)} className="text-sm text-red-500">
          cambiar
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={campo}
        placeholder={placeholder || "Buscar ciudad"}
      />
      {resultados.length > 0 && (
        <div className="mb-3 flex max-h-52 flex-col gap-1 overflow-y-auto">
          {resultados.map((c) => (
            <button
              key={c.codigo}
              type="button"
              onClick={() => {
                onSelect(c);
                setQ("");
                setResultados([]);
              }}
              className="rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              {c.ciudad} <span className="text-slate-400">· {c.distrito}, {c.departamento}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function NuevaAutofactura() {
  const router = useRouter();
  const [v, setV] = useState({ naturaleza: 1, docTipo: 1, docNumero: "", nombre: "", direccion: "", numeroCasa: "" });
  const [ciudadVendedor, setCiudadVendedor] = useState(null);
  const [trans, setTrans] = useState({ direccion: "" });
  const [ciudadTrans, setCiudadTrans] = useState(null);
  const [cons, setCons] = useState({ tipo: 1, numero: "", control: "" });
  const [tipoTransaccion, setTipoTransaccion] = useState(10);
  const [obs, setObs] = useState("");
  const [items, setItems] = useState([{ descripcion: "", cantidad: 1, precioUnitario: "" }]);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [busquedaProv, setBusquedaProv] = useState("");
  const [resultadosProv, setResultadosProv] = useState([]);
  const provDeb = useDebounced(busquedaProv);
  const [proveedorId, setProveedorId] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) router.push("/");
  }, [router]);

  useEffect(() => {
    if (!provDeb) return setResultadosProv([]);
    apiFetch(`/api/proveedores?q=${encodeURIComponent(provDeb)}`).then(setResultadosProv).catch(() => {});
  }, [provDeb]);

  function setItem(i, campo, valor) {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, [campo]: valor } : it)));
  }

  const total = items.reduce((a, it) => a + Number(it.precioUnitario || 0) * Number(it.cantidad || 0), 0);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const a = await apiFetch("/api/autofacturas", {
        method: "POST",
        body: JSON.stringify({
          proveedorId,
          vendedor: {
            naturaleza: v.naturaleza,
            docTipo: v.docTipo,
            docNumero: v.docNumero,
            nombre: v.nombre,
            direccion: v.direccion,
            numeroCasa: v.numeroCasa || "0",
            ciudad: ciudadVendedor?.codigo,
          },
          transaccion: { direccion: trans.direccion, ciudad: ciudadTrans?.codigo },
          constancia: cons,
          tipoTransaccion,
          observacion: obs || null,
          items: items.map((it) => ({
            descripcion: it.descripcion,
            cantidad: Number(it.cantidad),
            precioUnitario: Number(it.precioUnitario),
          })),
        }),
      });
      router.push(`/documentos/autofactura/${a.id}`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const listo =
    v.nombre.trim() &&
    v.docNumero.trim() &&
    v.direccion.trim() &&
    ciudadVendedor &&
    trans.direccion.trim() &&
    ciudadTrans &&
    cons.numero.trim() &&
    cons.control.trim() &&
    items.length > 0 &&
    items.every((it) => it.descripcion.trim() && Number(it.cantidad) > 0 && Number(it.precioUnitario) > 0);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-lg">
        <div className="py-6">
          <Link href="/documentos/autofactura" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Nueva autofactura</h1>
          <p className="text-sm text-slate-500">Compra a un no contribuyente. Los ítems no llevan IVA.</p>
        </div>

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow shadow-slate-200">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Vendedor</h2>

          {!proveedorId && (
            <>
              <input
                value={busquedaProv}
                onChange={(e) => setBusquedaProv(e.target.value)}
                className={campo}
                placeholder="Traer de un proveedor guardado (opcional)"
              />
              {resultadosProv.length > 0 && (
                <div className="mb-3 flex flex-col gap-1">
                  {resultadosProv.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProveedorId(p.id);
                        setV((x) => ({
                          ...x,
                          nombre: p.nombre || x.nombre,
                          docNumero: (p.documento || "").split("-")[0] || x.docNumero,
                        }));
                        setBusquedaProv("");
                        setResultadosProv([]);
                      }}
                      className="rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                    >
                      {p.nombre} {p.documento ? `· ${p.documento}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {proveedorId && (
            <button
              type="button"
              onClick={() => setProveedorId(null)}
              className="mb-3 text-sm text-red-500"
            >
              desvincular proveedor
            </button>
          )}

          <label className={etiqueta}>Naturaleza</label>
          <select value={v.naturaleza} onChange={(e) => setV((x) => ({ ...x, naturaleza: Number(e.target.value) }))} className={campo}>
            {NATURALEZAS.map((n) => (
              <option key={n.v} value={n.v}>{n.t}</option>
            ))}
          </select>

          <label className={etiqueta}>Nombre y apellido</label>
          <input value={v.nombre} onChange={(e) => setV((x) => ({ ...x, nombre: e.target.value }))} className={campo} required />

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={etiqueta}>Tipo de documento</label>
              <select value={v.docTipo} onChange={(e) => setV((x) => ({ ...x, docTipo: Number(e.target.value) }))} className={campo}>
                {DOC_TIPOS.map((d) => (
                  <option key={d.v} value={d.v}>{d.t}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className={etiqueta}>Número</label>
              <input
                value={v.docNumero}
                onChange={(e) => setV((x) => ({ ...x, docNumero: e.target.value }))}
                className={campo}
                placeholder="Sin puntos"
                required
              />
            </div>
          </div>

          <label className={etiqueta}>Dirección del vendedor</label>
          <input value={v.direccion} onChange={(e) => setV((x) => ({ ...x, direccion: e.target.value }))} className={campo} required />

          <label className={etiqueta}>Ciudad del vendedor</label>
          <BuscadorCiudad valor={ciudadVendedor} onSelect={setCiudadVendedor} placeholder="Ej: Villa Hayes" />

          <h2 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">
            Constancia de no ser contribuyente
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            El vendedor la obtiene en Marangatú / DNIT. Sin ella no se puede emitir.
          </p>
          <label className={etiqueta}>Tipo</label>
          <select value={cons.tipo} onChange={(e) => setCons((x) => ({ ...x, tipo: Number(e.target.value) }))} className={campo}>
            {CONSTANCIAS.map((c) => (
              <option key={c.v} value={c.v}>{c.t}</option>
            ))}
          </select>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={etiqueta}>Número (11 dígitos)</label>
              <input value={cons.numero} onChange={(e) => setCons((x) => ({ ...x, numero: e.target.value }))} className={campo} required />
            </div>
            <div className="flex-1">
              <label className={etiqueta}>Código de control</label>
              <input value={cons.control} onChange={(e) => setCons((x) => ({ ...x, control: e.target.value }))} className={campo} required />
            </div>
          </div>

          <h2 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Lugar de la compra</h2>
          <label className={etiqueta}>Dirección donde se hizo la transacción</label>
          <input value={trans.direccion} onChange={(e) => setTrans({ direccion: e.target.value })} className={campo} required />
          <label className={etiqueta}>Ciudad</label>
          <BuscadorCiudad valor={ciudadTrans} onSelect={setCiudadTrans} placeholder="Ej: Villa Hayes" />

          <h2 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Detalle</h2>
          <label className={etiqueta}>Tipo de transacción</label>
          <select value={tipoTransaccion} onChange={(e) => setTipoTransaccion(Number(e.target.value))} className={campo}>
            {TIPO_TRANSACCION.map((t) => (
              <option key={t.v} value={t.v}>{t.t}</option>
            ))}
          </select>

          {items.map((it, i) => (
            <div key={i} className="mb-3 rounded-xl border border-slate-200 p-3">
              <input
                value={it.descripcion}
                onChange={(e) => setItem(i, "descripcion", e.target.value)}
                className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy"
                placeholder="Descripción (ej: Mandioca)"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={it.cantidad}
                  onChange={(e) => setItem(i, "cantidad", e.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-right text-sm"
                  placeholder="Cant."
                />
                <span className="text-slate-400">×</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={it.precioUnitario}
                  onChange={(e) => setItem(i, "precioUnitario", e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-right text-sm"
                  placeholder="Precio unitario Gs"
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems((a) => a.filter((_, j) => j !== i))} className="text-red-500">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((a) => [...a, { descripcion: "", cantidad: 1, precioUnitario: "" }])}
            className="mb-3 text-sm font-semibold text-navy"
          >
            + Agregar ítem
          </button>

          <label className={etiqueta}>Observación (opcional)</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} className={campo} />

          <div className="mb-4 flex justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="font-semibold text-slate-500">Total</span>
            <span className="text-xl font-extrabold text-navy">Gs {formatoGs.format(Math.round(total))}</span>
          </div>

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={!listo || enviando}
            className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-50"
          >
            {enviando ? "Emitiendo…" : "Emitir autofactura"}
          </button>
        </form>
      </div>
    </main>
  );
}
