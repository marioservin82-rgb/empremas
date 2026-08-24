"use client";

import { useEffect, useState } from "react";

function aNumero(v) {
  if (v === undefined || v === null || v === "") return 0;
  return Number(String(v).replace(",", ".")) || 0;
}

// Input de cantidad para productos por peso/metro (kg, litro, metro...).
// <input type="number"> de HTML solo acepta punto como separador decimal,
// sin importar el idioma de Windows - pero el teclado numerico configurado
// en español (Paraguay) manda coma en la tecla decimal, así que esa tecla
// no hacía nada y el cajero tenía que ir a buscar el punto en la fila de
// arriba. Este campo es un <input type="text"> controlado que acepta
// coma o punto indistintamente.
//
// onChange manda "" cuando el campo queda vacio (no un 0 forzado) - varios
// formularios de esta app usan el campo vacio como "no definido" (ej.
// stock minimo opcional), distinto de "definido en cero". Quien llama
// decide si un campo puntual necesita convertir "" a 0 (ej. cantidad de
// un carrito, que siempre hace falta un numero para el total).
export default function CampoCantidad({ value, onChange, ...props }) {
  const [texto, setTexto] = useState(value === undefined || value === null ? "" : String(value));

  useEffect(() => {
    // Solo resincroniza si el numero de afuera cambio de verdad - mientras
    // el usuario esta tipeando, nunca se pisa lo que ya escribio (evita
    // que un "1," se borre solo antes de que pueda seguir con los
    // decimales, o que "0" quede en blanco de nuevo).
    if (aNumero(value) !== aNumero(texto)) {
      setTexto(value === undefined || value === null ? "" : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function manejarCambio(e) {
    let nuevo = e.target.value.replace(/[^0-9.,]/g, "");
    // Si ya hay un separador decimal, cualquier otro que venga despues se
    // descarta (no se puede escribir "1,2,3").
    let vistoSeparador = false;
    nuevo = nuevo.replace(/[.,]/g, (m) => {
      if (vistoSeparador) return "";
      vistoSeparador = true;
      return m;
    });
    setTexto(nuevo);
    onChange(nuevo === "" ? "" : Number(nuevo.replace(",", ".")) || 0);
  }

  return <input type="text" inputMode="decimal" value={texto} onChange={manejarCambio} {...props} />;
}
