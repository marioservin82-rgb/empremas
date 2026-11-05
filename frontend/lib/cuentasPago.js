"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// Cuentas bancarias / billeteras activas de la empresa, para elegir a cual
// entra (o de cual sale) una transferencia. Si la empresa no cargo ninguna,
// la lista queda vacia y las pantallas funcionan como siempre.
export function useCuentasPago() {
  const [cuentas, setCuentas] = useState([]);
  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) return;
    apiFetch("/api/cuentas?activas=1")
      .then((d) => setCuentas(d.cuentas))
      .catch(() => setCuentas([]));
  }, []);
  const principal = cuentas.find((c) => c.es_principal) || cuentas[0] || null;
  return { cuentas, principalId: principal?.id || "" };
}

// Texto corto para mostrar una cuenta ("Itaú cta. cte.").
export function nombreDeCuenta(cuentas, cuentaId) {
  return cuentas.find((c) => c.id === cuentaId)?.nombre || "";
}
