"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const ETIQUETA_ROL = {
  dueno: "Dueño",
  encargado: "Encargado",
  cajero: "Cajero",
};

export default function Empleados() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [multiSucursal, setMultiSucursal] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios")
      .then(setUsuarios)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
    apiFetch("/api/empresas/actual")
      .then((e) => setMultiSucursal(e.limite_sucursales > 1))
      .catch(() => {});
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between py-6">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Empleados</h1>
          </div>
          <div className="flex gap-2">
            {multiSucursal && (
              <Link
                href="/sucursales"
                className="rounded-xl bg-slate-700 px-5 py-3 font-semibold text-white hover:bg-slate-800"
              >
                Sucursales
              </Link>
            )}
            <Link
              href="/empleados/nuevo"
              className="rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-light"
            >
              + Agregar empleado
            </Link>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {cargando ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-3">
            {usuarios.map((u) => (
              <div
                key={u.id}
                className={`rounded-2xl bg-white p-5 shadow shadow-slate-200 ${!u.activo ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {u.nombre}
                      {!u.activo && <span className="ml-2 text-sm font-semibold text-red-500">INACTIVO</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {u.email} · {ETIQUETA_ROL[u.rol]}
                      {multiSucursal && u.sucursal_nombre && ` · ${u.sucursal_nombre}`}
                      {u.permisos?.length > 0 && ` · ${u.permisos.length} permiso${u.permisos.length === 1 ? "" : "s"} extra`}
                    </p>
                  </div>
                  {u.rol !== "dueno" && (
                    <Link
                      href={`/empleados/${u.id}/editar`}
                      className="text-sm font-semibold text-navy hover:text-brand"
                    >
                      Editar
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
