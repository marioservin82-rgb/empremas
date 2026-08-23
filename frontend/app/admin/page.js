"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";
import { linkWhatsapp } from "@/lib/whatsapp";

const ESTILO_ESTADO = {
  prueba: "bg-slate-100 text-slate-700",
  activa: "bg-emerald-100 text-emerald-700",
  mora: "bg-amber-100 text-amber-700",
  suspendida: "bg-red-100 text-red-700",
};

const ESTILO_ESTADO_NEGOCIO = {
  registro_incompleto: "bg-slate-100 text-slate-700",
  sin_ventas: "bg-amber-100 text-amber-700",
  activo: "bg-emerald-100 text-emerald-700",
};

const ETIQUETA_ESTADO_NEGOCIO = {
  registro_incompleto: "Registro incompleto",
  sin_ventas: "Sin ventas todavía",
  activo: "Activo",
};

const FILTROS = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "registro_incompleto", etiqueta: "Registro incompleto" },
  { valor: "sin_ventas", etiqueta: "Sin ventas" },
  { valor: "activo", etiqueta: "Activas" },
];

function formatoFecha(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-PY");
}

export default function AdminEmpresas() {
  const router = useRouter();
  const [admin, setAdmin] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [ordenAsc, setOrdenAsc] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_admin_token")) {
      router.push("/admin/login");
      return;
    }
    adminFetch("/api/admin/yo")
      .then(setAdmin)
      .catch(() => router.push("/admin/login"));
    adminFetch("/api/admin/empresas")
      .then(setEmpresas)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [router]);

  function salir() {
    localStorage.removeItem("empremas_admin_token");
    router.push("/admin/login");
  }

  const empresasVisibles = empresas
    .filter((e) => filtroEstado === "todas" || e.estado_negocio === filtroEstado)
    .sort((a, b) => {
      const fa = new Date(a.creado_en).getTime();
      const fb = new Date(b.creado_en).getTime();
      return ordenAsc ? fa - fb : fb - fa;
    });

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">EMPREMAS · Admin</h1>
            <p className="text-slate-500">{admin ? `Hola, ${admin.nombre}` : "Empresas de la plataforma"}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/contadores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Contadores aliados
            </Link>
            <Link href="/admin/novedades" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Novedades
            </Link>
            <Link href="/admin/configuracion" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Configuración de soporte
            </Link>
            <Link href="/admin/perfil/password" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Cambiar contraseña
            </Link>
            <button onClick={salir} className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Salir
            </button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!cargando && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  onClick={() => setFiltroEstado(f.valor)}
                  className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                    filtroEstado === f.valor ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.etiqueta}
                </button>
              ))}
            </div>
            <button
              onClick={() => setOrdenAsc((v) => !v)}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Registro: {ordenAsc ? "más antiguas primero" : "más recientes primero"}
            </button>
          </div>
        )}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            {empresasVisibles.map((e) => {
              const linkWa = linkWhatsapp(e.telefono, `Hola ${e.razon_social}, te contactamos de EMPREMAS`);
              return (
                <div
                  key={e.id}
                  onClick={() => router.push(`/admin/empresas/${e.id}`)}
                  className="block cursor-pointer rounded-2xl bg-white p-5 shadow shadow-slate-200 transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-800">{e.razon_social}</p>
                      <p className="text-sm text-slate-400">
                        RUC {e.ruc} · Plan {e.plan} · Usuarios {e.usuarios_activos}/{e.limite_usuarios} · Sucursales{" "}
                        {e.sucursales_activas}/{e.limite_sucursales} · Vence {formatoFecha(e.vence_en)}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Registrada {formatoFecha(e.creado_en)}
                        {e.telefono && (
                          <>
                            {" · "}
                            {e.telefono}{" "}
                            {linkWa && (
                              <a
                                href={linkWa}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(ev) => ev.stopPropagation()}
                                className="font-semibold text-emerald-600 hover:text-emerald-700"
                              >
                                WhatsApp
                              </a>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ESTILO_ESTADO[e.estado]}`}>
                        {e.estado}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${ESTILO_ESTADO_NEGOCIO[e.estado_negocio]}`}
                      >
                        {ETIQUETA_ESTADO_NEGOCIO[e.estado_negocio]}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {empresasVisibles.length === 0 && (
              <p className="text-slate-500">
                {empresas.length === 0 ? "Todavía no hay empresas registradas." : "Ninguna empresa coincide con este filtro."}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
