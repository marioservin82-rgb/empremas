"use client";

// Cuenta de una transferencia + numero de operacion (opcional). Se muestra solo
// cuando la forma de pago es transferencia y la empresa tiene cuentas cargadas.
export default function SelectorCuenta({ cuentas, cuentaId, onCuentaId, nroOperacion, onNroOperacion, etiqueta = "Cuenta de la transferencia" }) {
  if (!cuentas || cuentas.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <label className="mb-1 block text-sm font-medium text-slate-700">{etiqueta}</label>
      <select
        value={cuentaId}
        onChange={(e) => onCuentaId(e.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
      >
        <option value="">Elegí una cuenta…</option>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.banco && !c.nombre.toLowerCase().includes(c.banco.toLowerCase()) ? ` · ${c.banco}` : ""}
          </option>
        ))}
      </select>
      <label className="mb-1 mt-2 block text-sm font-medium text-slate-500">N° de operación (opcional)</label>
      <input
        value={nroOperacion}
        onChange={(e) => onNroOperacion(e.target.value)}
        maxLength={60}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        placeholder="Comprobante de la transferencia"
      />
    </div>
  );
}
