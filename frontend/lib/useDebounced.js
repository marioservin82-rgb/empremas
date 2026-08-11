"use client";

import { useEffect, useState } from "react";

// Devuelve `valor` recien despues de que pase `delayMs` sin que cambie -
// para buscar mientras se escribe sin mandar un pedido por cada letra.
export function useDebounced(valor, delayMs = 300) {
  const [debounced, setDebounced] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setDebounced(valor), delayMs);
    return () => clearTimeout(temporizador);
  }, [valor, delayMs]);

  return debounced;
}
