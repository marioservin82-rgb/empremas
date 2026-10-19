"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { linkWhatsapp } from "@/lib/whatsapp";
import { numeroCupon } from "@/lib/cuponesSorteo";

const formatoGs = new Intl.NumberFormat("es-PY");
const campo =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 disabled:bg-slate-100";
const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

function fecha(f) {
  if (!f) return "—";
  return new Date(`${String(f).slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY");
}

const FORM_VACIO = { nombre: "", montoPorCupon: "30000", vigenteDesde: "", vigenteHasta: "", fechaSorteo: "", premios: "" };

export default function SorteoPagina() {
  const router = useRouter();
  const [yo, setYo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [sorteos, setSorteos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");

  const [numeroBuscado, setNumeroBuscado] = useState("");
  const [verificacion, setVerificacion] = useState(null);

  const [verLista, setVerLista] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [conAnulados, setConAnulados] = useState(false);
  const [cupones, setCupones] = useState([]);

  const activo = sorteos.find((s) => s.activo) || null;
  // Resumen, verificacion y lista funcionan tambien con el ultimo sorteo
  // cerrado: el ganador se verifica despues de la fecha del sorteo.
  const elegido = activo || sorteos[0] || null;
  const esDueno = yo?.rol === "dueno";

  const cargar = useCallback(async () => {
    setError("");
    try {
      const { sorteos: lista } = await apiFetch("/api/sorteos");
      setSorteos(lista);
      const a = lista.find((s) => s.activo);
      const el = a || lista[0];
      setResumen(el ? await apiFetch(`/api/sorteos/${el.id}/resumen`) : null);
      if (a) {
        setForm({
          nombre: a.nombre,
          montoPorCupon: String(a.montoPorCupon),
          vigenteDesde: a.vigenteDesde || "",
          vigenteHasta: a.vigenteHasta || "",
          fechaSorteo: a.fechaSorteo || "",
          premios: a.premios || "",
        });
      } else {
        setForm(FORM_VACIO);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios/yo")
      .then((u) => {
        if (u.rol !== "dueno" && u.rol !== "encargado") router.push("/panel");
        setYo(u);
      })
      .catch(() => {});
    cargar();
  }, [router, cargar]);

  useEffect(() => {
    if (!verLista || !elegido) return;
    const t = setTimeout(() => {
      apiFetch(`/api/sorteos/${elegido.id}/cupones?q=${encodeURIComponent(filtro)}${conAnulados ? "&anulados=1" : ""}`)
        .then((d) => setCupones(d.cupones))
        .catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [verLista, elegido, filtro, conAnulados, resumen]);

  const actualizar = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function cuerpo() {
    return {
      nombre: form.nombre,
      montoPorCupon: Number(form.montoPorCupon),
      vigenteDesde: form.vigenteDesde || null,
      vigenteHasta: form.vigenteHasta || null,
      fechaSorteo: form.fechaSorteo || null,
      premios: form.premios,
    };
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      if (activo) {
        const b = cuerpo();
        // El monto no se puede cambiar una vez emitido el primer cupon.
        if (resumen && resumen.cuponesValidos + resumen.cuponesAnulados > 0) delete b.montoPorCupon;
        await apiFetch(`/api/sorteos/${activo.id}`, { method: "PATCH", body: JSON.stringify(b) });
        setAviso("Cambios guardados.");
      } else {
        await apiFetch("/api/sorteos", { method: "POST", body: JSON.stringify(cuerpo()) });
        setAviso("Sorteo creado. Desde ahora las ventas al contado suman cupones.");
      }
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cerrar() {
    if (
      !window.confirm(
        "¿Cerrar el sorteo? Las ventas dejan de generar cupones. Los cupones emitidos se conservan para verificar el ganador."
      )
    )
      return;
    setError("");
    try {
      await apiFetch(`/api/sorteos/${activo.id}`, { method: "PATCH", body: JSON.stringify({ activo: false }) });
      setAviso("Sorteo cerrado.");
      setVerificacion(null);
      setVerLista(false);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function verificar(e) {
    e.preventDefault();
    if (!numeroBuscado.trim()) return;
    setError("");
    try {
      setVerificacion(await apiFetch(`/api/sorteos/${elegido.id}/cupones/${encodeURIComponent(numeroBuscado.trim())}`));
    } catch (err) {
      setVerificacion(null);
      setError(err.message);
    }
  }

  if (cargando) return <main className="p-6 text-slate-400">Cargando…</main>;

  const hayEmitidos = resumen && resumen.cuponesValidos + resumen.cuponesAnulados > 0;

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 py-6 print:hidden">
          <Link href="/panel" className="text-sm font-semibold text-slate-400 hover:text-navy">
            ← Panel
          </Link>
          <h1 className="text-2xl font-bold text-navy">🎟 Sorteo con cupones</h1>
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 print:hidden">{error}</p>}
        {aviso && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 print:hidden">{aviso}</p>}

        <form onSubmit={guardar} className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200 print:hidden">
          <h2 className="mb-1 text-lg font-bold text-slate-800">{activo ? activo.nombre : "Nuevo sorteo"}</h2>
          <p className="mb-4 text-sm text-slate-400">
            {activo
              ? activo.vigenteHoy
                ? "Activo: las ventas al contado suman cupones."
                : "Activo, pero hoy está fuera de las fechas de vigencia: no suma cupones."
              : "Cada compra al contado suma cupones; el sobrante se acumula por cliente."}
          </p>

          <label className={etiqueta}>Nombre del sorteo</label>
          <input value={form.nombre} onChange={actualizar("nombre")} disabled={!esDueno} className={campo} placeholder="Gran sorteo de fin de año" required />

          <label className={`${etiqueta} mt-4`}>Un cupón por cada (Gs) de compras al contado</label>
          <input
            type="number"
            min="1"
            value={form.montoPorCupon}
            onChange={actualizar("montoPorCupon")}
            disabled={!esDueno || hayEmitidos}
            className={campo}
            required
          />
          {hayEmitidos && <p className="mt-1 text-xs text-slate-400">Ya se emitieron cupones: el monto no se puede cambiar.</p>}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={etiqueta}>Empieza</label>
              <input type="date" value={form.vigenteDesde} onChange={actualizar("vigenteDesde")} disabled={!esDueno} className={campo} />
            </div>
            <div>
              <label className={etiqueta}>Termina</label>
              <input type="date" value={form.vigenteHasta} onChange={actualizar("vigenteHasta")} disabled={!esDueno} className={campo} />
            </div>
            <div>
              <label className={etiqueta}>Fecha del sorteo</label>
              <input type="date" value={form.fechaSorteo} onChange={actualizar("fechaSorteo")} disabled={!esDueno} className={campo} />
            </div>
          </div>

          <label className={`${etiqueta} mt-4`}>Premios (se imprime en el cupón)</label>
          <input value={form.premios} onChange={actualizar("premios")} disabled={!esDueno} className={campo} placeholder="Ej.: 1 moto 0 km + 5 canastas" />

          {esDueno && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={guardando}
                className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
              >
                {guardando ? "Guardando…" : activo ? "Guardar cambios" : "Crear sorteo"}
              </button>
              {activo && (
                <button type="button" onClick={cerrar} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-200">
                  Cerrar sorteo
                </button>
              )}
            </div>
          )}
        </form>

        {elegido && resumen && (
          <>
            {!elegido.activo && (
              <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 print:hidden">
                «{elegido.nombre}» está cerrado: ya no suma cupones. Podés seguir verificando ganadores.
              </p>
            )}
            <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200 print:hidden">
              <h2 className="mb-3 text-lg font-bold text-slate-800">Resumen</h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-2xl font-extrabold text-emerald-700">{formatoGs.format(resumen.cuponesValidos)}</p>
                  <p className="text-xs text-emerald-700">cupones válidos</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-2xl font-extrabold text-navy">{formatoGs.format(resumen.participantes)}</p>
                  <p className="text-xs text-slate-500">participantes</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-2xl font-extrabold text-slate-500">{formatoGs.format(resumen.cuponesAnulados)}</p>
                  <p className="text-xs text-slate-500">anulados</p>
                </div>
              </div>
              {resumen.topClientes.length > 0 && (
                <>
                  <p className="mb-1 mt-4 text-sm font-semibold text-slate-600">Más cupones</p>
                  <div className="flex flex-col divide-y divide-slate-100">
                    {resumen.topClientes.map((c) => (
                      <div key={`${c.nombre}-${c.celular}`} className="flex justify-between py-1.5 text-sm">
                        <span className="text-slate-700">{c.nombre}</span>
                        <span className="font-semibold text-navy">{c.cupones}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <form onSubmit={verificar} className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200 print:hidden">
              <h2 className="mb-1 text-lg font-bold text-slate-800">Verificar un cupón</h2>
              <p className="mb-3 text-sm text-slate-400">
                Cuando saques un papel del buzón, escribí el número: el sistema dice si es válido (no de una venta anulada) y a quién llamar.
              </p>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  value={numeroBuscado}
                  onChange={(e) => setNumeroBuscado(e.target.value.replace(/\D/g, ""))}
                  className={campo}
                  placeholder="N° de cupón"
                />
                <button type="submit" className="rounded-xl bg-navy px-5 py-3 font-semibold text-white hover:bg-navy-2">
                  Verificar
                </button>
              </div>
              {verificacion && !verificacion.existe && (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">Ese número no existe en este sorteo.</p>
              )}
              {verificacion?.existe && (
                <div className={`mt-3 rounded-xl px-4 py-3 ${verificacion.valido ? "bg-emerald-50" : "bg-red-50"}`}>
                  <p className={`font-bold ${verificacion.valido ? "text-emerald-700" : "text-red-600"}`}>
                    Cupón {numeroCupon(verificacion.numero)} — {verificacion.valido ? "VÁLIDO" : "ANULADO (la venta se anuló)"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {verificacion.clienteNombre}
                    {verificacion.clienteCelular ? ` · ${verificacion.clienteCelular}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    Ticket N° {verificacion.numeroTicket} · Gs {formatoGs.format(verificacion.total)} · {fecha(verificacion.creadoEn)}
                  </p>
                  {verificacion.valido && verificacion.clienteCelular && (
                    <a
                      href={linkWhatsapp(verificacion.clienteCelular, `¡Hola ${verificacion.clienteNombre}! Tu cupón N° ${numeroCupon(verificacion.numero)} salió ganador en el sorteo ${elegido.nombre} 🎉`)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Avisar por WhatsApp
                    </a>
                  )}
                </div>
              )}
            </form>

            <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200">
              <div className="flex items-center justify-between print:hidden">
                <h2 className="text-lg font-bold text-slate-800">Lista de cupones</h2>
                <button
                  onClick={() => setVerLista((v) => !v)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                >
                  {verLista ? "Ocultar" : "Ver lista"}
                </button>
              </div>
              {verLista && (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-3 print:hidden">
                    <input
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                      className={`${campo} max-w-xs`}
                      placeholder="Buscar nombre, celular o N°"
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={conAnulados} onChange={(e) => setConAnulados(e.target.checked)} />
                      Incluir anulados
                    </label>
                    <button onClick={() => window.print()} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light">
                      Imprimir lista
                    </button>
                  </div>
                  <div className="reporte-imprimible mt-3">
                    <style>{"@page { size: A4; margin: 15mm; }"}</style>
                    <p className="mb-2 hidden text-base font-bold print:block">
                      {elegido.nombre} — lista de cupones ({cupones.length})
                    </p>
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-1.5">N°</th>
                          <th>Nombre</th>
                          <th>Celular</th>
                          <th>Ticket</th>
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cupones.map((c) => (
                          <tr key={c.numero} className={`border-b border-slate-100 ${c.anulado ? "text-red-500 line-through" : ""}`}>
                            <td className="py-1 font-mono">{numeroCupon(c.numero)}</td>
                            <td>{c.cliente_nombre}</td>
                            <td>{c.cliente_celular || "—"}</td>
                            <td>{c.numero_ticket}</td>
                            <td>{fecha(c.creado_en)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {cupones.length === 0 && <p className="py-3 text-sm text-slate-400">Sin cupones.</p>}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {sorteos.filter((s) => s.id !== elegido?.id).length > 0 && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow shadow-slate-200 print:hidden">
            <h2 className="mb-2 text-lg font-bold text-slate-800">Sorteos anteriores</h2>
            {sorteos
              .filter((s) => s.id !== elegido?.id)
              .map((s) => (
                <p key={s.id} className="py-1 text-sm text-slate-600">
                  {s.nombre} · sorteo {fecha(s.fechaSorteo)}
                </p>
              ))}
          </div>
        )}
      </div>
    </main>
  );
}
