"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";

const ESTILO_ESTADO = {
  prueba: "bg-slate-100 text-slate-700",
  activa: "bg-emerald-100 text-emerald-700",
  mora: "bg-amber-100 text-amber-700",
  suspendida: "bg-red-100 text-red-700",
};

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

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">EMPREMAS · Admin</h1>
            <p className="text-slate-500">{admin ? `Hola, ${admin.nombre}` : "Empresas de la plataforma"}</p>
          </div>
          <div className="flex items-center gap-4">
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

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            {empresas.map((e) => (
              <Link
                key={e.id}
                href={`/admin/empresas/${e.id}`}
                className="block rounded-2xl bg-white p-5 shadow shadow-slate-200 transition hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-slate-800">{e.razon_social}</p>
                    <p className="text-sm text-slate-400">
                      RUC {e.ruc} · Plan {e.plan} · Usuarios {e.usuarios_activos}/{e.limite_usuarios} · Sucursales{" "}
                      {e.sucursales_activas}/{e.limite_sucursales} · Vence {formatoFecha(e.vence_en)}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ESTILO_ESTADO[e.estado]}`}>
                    {e.estado}
                  </span>
                </div>
              </Link>
            ))}
            {empresas.length === 0 && <p className="text-slate-500">Todavía no hay empresas registradas.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
