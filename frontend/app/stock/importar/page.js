"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { parsearCsv, filasAObjetos } from "@/lib/csv";

const COLUMNAS = [
  "nombre",
  "codigo_barras",
  "unidad_medida",
  "precio_costo",
  "precio_contado",
  "precio_credito",
  "precio_mayorista",
  "tasa_iva",
  "stock",
];

const MAPEO_CAMPO = {
  nombre: "nombre",
  codigo_barras: "codigoBarras",
  unidad_medida: "unidadMedida",
  precio_costo: "precioCosto",
  precio_contado: "precioContado",
  precio_credito: "precioCredito",
  precio_mayorista: "precioMayorista",
  tasa_iva: "tasaIva",
  stock: "stock",
};

function descargarPlantilla() {
  const encabezado = COLUMNAS.join(",");
  const ejemplo = "Tornillo autoperforante 2 pulg,7801111111111,unidad,450,800,950,650,10,690";
  const contenido = `${encabezado}\n${ejemplo}\n`;
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "plantilla-productos.csv";
  enlace.click();
}

export default function ImportarProductos() {
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
      const productos = filas.map((f) => {
        const p = {};
        for (const columna of COLUMNAS) {
          if (f[columna] !== undefined && f[columna] !== "") {
            p[MAPEO_CAMPO[columna]] = f[columna];
          }
        }
        return p;
      });
      const r = await apiFetch("/api/productos/importar", {
        method: "POST",
        body: JSON.stringify({ productos }),
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
          <Link href="/stock" className="text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold text-navy">Importar productos desde CSV</h1>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
          <p className="mb-3 text-sm text-slate-600">
            El archivo necesita estas columnas (en cualquier orden), la primera fila es el encabezado. Solo{" "}
            <strong>nombre</strong> es obligatorio. Si el código de barras ya existe en el catálogo, ese producto se
            actualiza en vez de duplicarse — el stock no se toca al actualizar (para eso está Ajuste de inventario).
          </p>
          <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
            {COLUMNAS.join(", ")}
          </p>
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
              {importando ? "Importando..." : `Importar ${filas.length} producto${filas.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
