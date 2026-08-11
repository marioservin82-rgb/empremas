"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const PERMISOS_DISPONIBLES = [
  { valor: "ver_costos", etiqueta: "Ver costos y márgenes", descripcion: "Hoy oculto para cajero — muestra el precio de costo y el margen en Stock." },
  { valor: "ver_reportes", etiqueta: "Ver reportes", descripcion: "Reporte de ventas, salud financiera, inventario valorizado, historial de turnos." },
  { valor: "gestionar_inventario", etiqueta: "Gestionar inventario", descripcion: "Crear/editar productos, ajustar stock, importar CSV." },
  { valor: "gestionar_compras", etiqueta: "Gestionar compras", descripcion: "Registrar compras, crear/editar proveedores, pagarles." },
  { valor: "gestionar_clientes", etiqueta: "Gestionar clientes", descripcion: "Crear y editar clientes." },
  { valor: "anular_sin_pin", etiqueta: "Anular ventas sin PIN", descripcion: "No necesita el PIN de un dueño/encargado para anular una venta." },
];

export default function EditarEmpleado() {
  const router = useRouter();
  const { id } = useParams();

  const [usuario, setUsuario] = useState(null);
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("cajero");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState("");
  const [permisos, setPermisos] = useState([]);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/usuarios")
      .then((lista) => {
        const u = lista.find((x) => x.id === id);
        if (!u) {
          setError("Empleado no encontrado");
          return;
        }
        setUsuario(u);
        setNombre(u.nombre);
        setRol(u.rol);
        setSucursalId(u.sucursal_id || "");
        setPermisos(u.permisos || []);
      })
      .catch((err) => setError(err.message));
    apiFetch("/api/empresas/actual")
      .then((e) => {
        if (e.limite_sucursales > 1) {
          apiFetch("/api/sucursales").then(setSucursales).catch(() => {});
        }
      })
      .catch(() => {});
  }, [id, router]);

  function alternarPermiso(valor) {
    setPermisos((actual) => (actual.includes(valor) ? actual.filter((p) => p !== valor) : [...actual, valor]));
  }

  async function guardar() {
    setError("");
    setExito("");
    if (nuevaPassword && nuevaPassword.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    setGuardando(true);
    try {
      const body = { nombre, rol };
      if (nuevaPassword) body.password = nuevaPassword;
      if (sucursales.length > 0) body.sucursalId = sucursalId;
      const actualizado = await apiFetch(`/api/usuarios/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (rol === "cajero") {
        await apiFetch(`/api/usuarios/${id}/permisos`, {
          method: "PUT",
          body: JSON.stringify({ permisos }),
        });
      }
      setUsuario({ ...actualizado, permisos: rol === "cajero" ? permisos : [] });
      setNuevaPassword("");
      setExito("Guardado.");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(activo) {
    setError("");
    try {
      const actualizado = await apiFetch(`/api/usuarios/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo }),
      });
      setUsuario(actualizado);
    } catch (err) {
      setError(err.message);
    }
  }

  const campo = "mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  const etiqueta = "mb-1 block text-sm font-medium text-slate-700";

  if (error && !usuario) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/empleados" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-blue-900">Editar empleado</h1>
          <p className="text-sm text-slate-400">{usuario.email}</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200">
          <label className={etiqueta}>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />

          <label className={etiqueta}>Rol</label>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {[
              { valor: "cajero", etiqueta: "Cajero" },
              { valor: "encargado", etiqueta: "Encargado" },
            ].map((r) => (
              <button
                key={r.valor}
                type="button"
                onClick={() => setRol(r.valor)}
                className={`rounded-xl py-3 font-semibold transition ${
                  rol === r.valor ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r.etiqueta}
              </button>
            ))}
          </div>

          <label className={etiqueta}>Nueva contraseña (opcional)</label>
          <input
            type="password"
            value={nuevaPassword}
            onChange={(e) => setNuevaPassword(e.target.value)}
            className={campo}
            placeholder="Dejalo vacío para no cambiarla"
          />

          {sucursales.length > 0 && (
            <>
              <label className={etiqueta}>Sucursal</label>
              <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className={campo}>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </>
          )}

          {rol === "cajero" && (
            <div className="mb-4">
              <label className={etiqueta}>Permisos extra</label>
              <p className="mb-2 text-xs text-slate-400">
                Además de lo que ya puede hacer un cajero — sin ascenderlo a encargado.
              </p>
              <div className="flex flex-col gap-2">
                {PERMISOS_DISPONIBLES.map((p) => (
                  <label
                    key={p.valor}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={permisos.includes(p.valor)}
                      onChange={() => alternarPermiso(p.valor)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold text-slate-700">{p.etiqueta}</span>
                      <span className="block text-xs text-slate-400">{p.descripcion}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {exito && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{exito}</p>}

          <button
            onClick={guardar}
            disabled={guardando}
            className="mb-3 w-full rounded-xl bg-blue-700 py-3 text-lg font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>

          {usuario.activo ? (
            <button
              onClick={() => cambiarActivo(false)}
              className="w-full rounded-xl bg-red-50 py-3 font-semibold text-red-600 hover:bg-red-100"
            >
              Desactivar empleado
            </button>
          ) : (
            <button
              onClick={() => cambiarActivo(true)}
              className="w-full rounded-xl bg-emerald-50 py-3 font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Reactivar empleado
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
