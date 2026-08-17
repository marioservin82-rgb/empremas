"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";

const CATEGORIAS = [
  { valor: "nueva_funcion", etiqueta: "Nueva función", icono: "🆕" },
  { valor: "mejora", etiqueta: "Mejora", icono: "⚡" },
  { valor: "correccion", etiqueta: "Corrección", icono: "🔧" },
];

const ESTILO_CATEGORIA = {
  nueva_funcion: "bg-brand/10 text-brand",
  mejora: "bg-navy/10 text-navy",
  correccion: "bg-slate-100 text-slate-600",
};

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-PY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AdminNovedades() {
  const router = useRouter();
  const [novedades, setNovedades] = useState([]);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("nueva_funcion");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [publicando, setPublicando] = useState(false);

  function cargarNovedades() {
    return adminFetch("/api/admin/novedades")
      .then(setNovedades)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
      return;
    }
    cargarNovedades().finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function publicar(e) {
    e.preventDefault();
    setError("");
    setExito(false);
    setPublicando(true);
    try {
      await adminFetch("/api/admin/novedades", {
        method: "POST",
        body: JSON.stringify({ titulo, descripcion, categoria }),
      });
      setTitulo("");
      setDescripcion("");
      setCategoria("nueva_funcion");
      setExito(true);
      await cargarNovedades();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublicando(false);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <Link href="/admin" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Novedades</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lo que publicás acá lo ven todos los negocios que usan EMPREMAS, apenas entran a su panel.
          </p>
        </div>

        <form onSubmit={publicar} className="mb-8 rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Categoría</label>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                onClick={() => setCategoria(c.valor)}
                className={`rounded-xl py-2 text-sm font-semibold transition ${
                  categoria === c.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c.icono} {c.etiqueta}
              </button>
            ))}
          </div>

          <label className={etiqueta}>Título</label>
          <input
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className={campo}
            placeholder="Nueva función: recordatorio de pago por WhatsApp"
          />

          <label className={etiqueta}>Descripción</label>
          <textarea
            required
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className={campo}
            placeholder="Ahora podés mandar un recordatorio de pago por WhatsApp a tus clientes con un solo toque."
          />
          <p className="-mt-2 mb-4 text-xs text-slate-400">
            Usá lenguaje simple, como si le hablaras directo al dueño del negocio. Sin términos técnicos.
          </p>

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Publicado. Ya está visible para todos los negocios.
            </p>
          )}

          <button
            type="submit"
            disabled={publicando}
            className="w-full rounded-xl bg-slate-800 py-3 text-lg font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            {publicando ? "Publicando..." : "Publicar"}
          </button>
        </form>

        <h2 className="mb-3 font-bold text-slate-800">Historial</h2>
        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            {novedades.map((n) => (
              <div key={n.id} className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ESTILO_CATEGORIA[n.categoria]}`}>
                    {CATEGORIAS.find((c) => c.valor === n.categoria)?.icono}{" "}
                    {CATEGORIAS.find((c) => c.valor === n.categoria)?.etiqueta}
                  </span>
                  <span className="text-xs text-slate-400">{formatoFecha(n.creado_en)}</span>
                </div>
                <p className="font-bold text-slate-800">{n.titulo}</p>
                <p className="mt-1 text-sm text-slate-500">{n.descripcion}</p>
              </div>
            ))}
            {novedades.length === 0 && <p className="text-slate-500">Todavía no publicaste ninguna novedad.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
