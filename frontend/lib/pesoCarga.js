// Peso de una lista de items (presupuesto) a partir del peso por unidad de venta
// de cada producto (kg). Un producto sin peso cargado no suma: se cuenta aparte
// para avisar que el total esta incompleto.

const formatoNumero = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const formatoToneladas = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Peso de una linea en kg (null si el producto no tiene peso cargado).
export function pesoDeLinea(cantidad, pesoKg) {
  const peso = Number(pesoKg);
  if (!(peso > 0)) return null;
  return Math.round(Number(cantidad) * peso * 1000) / 1000;
}

// items: [{ cantidad, pesoKg }] -> { totalKg, sinPeso } (sinPeso = cantidad de lineas sin peso)
export function pesoTotal(items) {
  let totalKg = 0;
  let sinPeso = 0;
  for (const i of items) {
    const p = pesoDeLinea(i.cantidad, i.pesoKg);
    if (p === null) sinPeso += 1;
    else totalKg += p;
  }
  return { totalKg: Math.round(totalKg * 1000) / 1000, sinPeso };
}

// "50 kg" / "12.450 kg (12,45 t)"
export function formatoPeso(kg) {
  const n = Number(kg) || 0;
  const base = `${formatoNumero.format(n)} kg`;
  return n >= 1000 ? `${base} (${formatoToneladas.format(n / 1000)} t)` : base;
}
