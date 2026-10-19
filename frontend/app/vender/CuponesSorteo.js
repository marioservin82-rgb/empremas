"use client";

import { datosDeCupones, numeroCupon, imprimirCupones } from "@/lib/cuponesSorteo";
import { nombresEmpresa } from "@/lib/encabezadoEmpresa";

function fechaCorta(valor) {
  if (!valor) return null;
  const [y, m, d] = String(valor).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function Papel({ empresa, datos, cupon }) {
  return (
    <div className="cupon-papel w-[80mm] bg-white p-[3mm] text-center text-black">
      <p className="text-lg font-bold">{nombresEmpresa(empresa).principal}</p>
      <p className="mt-1 text-sm font-bold tracking-wide">CUPÓN DE SORTEO</p>
      <p className="text-sm">{datos.sorteo.nombre}</p>
      <p className="my-1 text-3xl font-extrabold">N° {numeroCupon(cupon.numero)}</p>
      <div className="my-1 border-t-2 border-dashed border-black" />
      <p className="text-left text-sm font-bold">Nombre: {cupon.nombre}</p>
      {cupon.celular && <p className="text-left text-sm">Celular: {cupon.celular}</p>}
      <p className="text-left text-xs">
        {datos.referencia} · {datos.fecha.toLocaleDateString("es-PY")}
      </p>
      <div className="my-1 border-t-2 border-dashed border-black" />
      {datos.sorteo.fechaSorteo && <p className="text-sm">Sorteo: {fechaCorta(datos.sorteo.fechaSorteo)}</p>}
      {datos.sorteo.premios && <p className="text-sm">{datos.sorteo.premios}</p>}
      <p className="mt-1 text-sm font-bold">Depositá este cupón en el buzón</p>
    </div>
  );
}

// Vista en pantalla de los cupones de una venta + boton para (re)imprimirlos,
// y el area oculta que usa la impresion del navegador (un papel por pagina).
// `venta` puede venir de POST /api/ventas o de GET /api/ventas/:id.
export default function CuponesSorteo({ empresa, venta }) {
  const datos = datosDeCupones(venta);
  if (!datos) return null;
  const n = datos.cupones.length;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-emerald-50 p-4">
      <p className="text-center font-bold text-emerald-800">
        🎟 {n} {n === 1 ? "cupón" : "cupones"} del sorteo «{datos.sorteo.nombre}»
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {datos.cupones.map((c) => (
          <span key={c.numero} className="rounded-lg bg-white px-3 py-1 font-mono text-lg font-bold text-navy shadow-sm">
            {numeroCupon(c.numero)}
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-emerald-700">
        {datos.cupones[0].nombre}
        {datos.cupones[0].celular ? ` · ${datos.cupones[0].celular}` : ""}
      </p>
      <button
        onClick={() => imprimirCupones(empresa, venta)}
        className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
      >
        Imprimir {n === 1 ? "cupón" : "cupones"}
      </button>

      {/* Solo se ve al imprimir con el navegador (ver globals.css). */}
      <div className="cupones-imprimibles">
        <style>{"@page { size: 80mm auto; margin: 0; }"}</style>
        {datos.cupones.map((c) => (
          <Papel key={c.numero} empresa={empresa} datos={datos} cupon={c} />
        ))}
      </div>
    </div>
  );
}
