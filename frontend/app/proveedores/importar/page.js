"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { parsearCsv, filasAObjetos } from "@/lib/csv";

const COLUMNAS = ["nombre", "documento", "telefono", "email", "direccion", "saldo_inicial"];

const MAPEO_CAMPO = {
  nombre: "nombre",
  documento: "documento",
  telefono: "telefono",
  email: "email",
  direccion: "direccion",
  saldo_inicial: "saldoInicial",
};

function descargarPlantilla() {
  const encabezado = COLUMNAS.join(",");
  const ejemplo = "Distribuidora San José,80098765,021987654,ventas@distsanjose.com,Ruta 2 Km 15,500000";
  const contenido = `${encabezado}\n${ejemplo}\n`;
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "plantilla-proveedores.csv";
  enlace.click();
}

export default function ImportarProveedores() {
  const router = useRouter();
  const inputArchivoRef = useRef(null);

  const [filas, setFilas] = useState([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
    }
  }, [router]);

  function onArchivoSeleccionado(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError("");
    setResultado(null);
    setNombreArchivo(archivo.name);

    const lector = new FileReader();
    lector.onload = () => {
      try {
        const objetos = filasAObjetos(parsearCsv(String(lector.result)));
        if (objetos.length === 0) {
          setError("El archivo no tiene filas de datos");
          setFilas([]);
          return;
        }
        setFilas(objetos);
      } catch {
        setError("No se pudo leer el archivo — ¿es un CSV válido?");
      }
    };
    lector.readAsText(archivo, "utf-8");
  }

  async function importar() {
    setError("");
    setImportando(true);
    try {
      const proveedores = filas.map((f) => {
        const p = {};
        for (const columna of COLUMNAS) {
          if (f[columna] !== undefined && f[columna] !== "") {
            p[MAPEO_CAMPO[columna]] = f[columna];
          }
        }
        return p;
      });
      const r = await apiFetch("/api/proveedores/importar", {
        method: "POST",
        body: JSON.stringify({ proveedores }),
      });
      setResultado(r);
      setFilas([]);
      setNombreArchivo("");
      if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    } catch (err) {
      setError(err.message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="py-6">
          <Link href="/proveedores" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Importar proveedores desde CSV</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 text-sm text-slate-600">
            El archivo necesita estas columnas (en cualquier orden), la primera fila es el encabezado. Solo{" "}
            <strong>nombre</strong> es obligatorio. Si el documento ya existe en el catálogo, ese proveedor se
            actualiza en vez de duplicarse — el saldo no se toca al actualizar (para eso está Ajustar saldo).{" "}
            <strong>saldo_inicial</strong> solo aplica al crear un proveedor nuevo y queda auditado como cualquier
            otro ajuste de saldo.
          </p>
          <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{COLUMNAS.join(", ")}</p>
          <button
            onClick={descargarPlantilla}
            className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-200"
          >
            Descargar plantilla
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <label className="mb-1 block text-sm font-medium text-slate-700">Elegí el archivo CSV</label>
          <input
            ref={inputArchivoRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onArchivoSeleccionado}
            className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
          {nombreArchivo && <p className="text-sm text-slate-400">{nombreArchivo}</p>}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {resultado && (
          <div className="mb-4 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-800 shadow shadow-emerald-100">
            <p className="font-semibold">
              Listo — {resultado.creados} creados, {resultado.actualizados} actualizados
              {resultado.errores.length > 0 && `, ${resultado.errores.length} con error`}.
            </p>
            {resultado.errores.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {resultado.errores.map((e, i) => (
                  <li key={i}>
                    Fila {e.fila}: {e.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {filas.length > 0 && (
          <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">
              Vista previa — {filas.length} fila{filas.length === 1 ? "" : "s"}
            </p>
            <div className="mb-4 max-h-80 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {COLUMNAS.map((c) => (
                      <th key={c} className="px-3 py-2 font-semibold text-slate-600">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 50).map((f, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {COLUMNAS.map((c) => (
                        <td key={c} className="px-3 py-2 text-slate-700">
                          {f[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 50 && (
              <p className="mb-3 text-xs text-slate-400">Mostrando las primeras 50 de {filas.length} filas.</p>
            )}
            <button
              onClick={importar}
              disabled={importando}
              className="w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
            >
              {importando ? "Importando..." : `Importar ${filas.length} proveedor${filas.length === 1 ? "" : "es"}`}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
