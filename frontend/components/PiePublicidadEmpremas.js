"use client";

import { useEffect, useState } from "react";
import { obtenerNumeroSoportePlataforma } from "@/lib/soportePlataforma";

// Version visual del pie publicitario (ver lib/piePublicidadEmpremas.js
// para el texto y el criterio de donde se usa). Si el que la usa ya tiene
// el numero resuelto (ticket comun/presupuesto, que tambien lo necesitan
// para armar la version ESC/POS del mismo documento), se lo pasa por
// `numero` para no pedirlo dos veces ni arriesgar que salga distinto en
// el papel y en pantalla. Si no, se busca sola (extractos, que no
// generan version ESC/POS).
export default function PiePublicidadEmpremas({ numero: numeroProp }) {
  const [numeroPropio, setNumeroPropio] = useState(null);

  useEffect(() => {
    if (numeroProp !== undefined) return;
    obtenerNumeroSoportePlataforma().then(setNumeroPropio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numero = numeroProp !== undefined ? numeroProp : numeroPropio;

  return (
    <div className="mt-4 border-t border-dashed border-slate-200 pt-2 text-center">
      <p className="text-[10px] leading-tight text-slate-400">Generado por EMPREMAS</p>
      <p className="text-[10px] leading-tight text-slate-400">Gestión comercial de negocios y facturación electrónica</p>
      {numero && <p className="text-[10px] leading-tight text-slate-400">{numero}</p>}
    </div>
  );
}
