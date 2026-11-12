// Insignia de la membresia vigente de un cliente (viene en cliente.membresia).
// Verde = activa, ambar = en gracia, rojo = vencida, gris = todavia sin pagar.
const ESTILO = {
  activa: "bg-emerald-100 text-emerald-700",
  gracia: "bg-amber-100 text-amber-700",
  vencida: "bg-red-100 text-red-700",
  pendiente: "bg-slate-200 text-slate-600",
};

function fechaCorta(iso) {
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}`;
}

export default function InsigniaMembresia({ membresia }) {
  if (!membresia) return null;
  const { estado, plan, venceEn } = membresia;
  const texto =
    estado === "activa"
      ? `⭐ Miembro ${plan} · vence ${fechaCorta(venceEn)}`
      : estado === "gracia"
        ? `⭐ ${plan} · venció ${fechaCorta(venceEn)} (en gracia)`
        : estado === "vencida"
          ? `⭐ ${plan} · vencida ${fechaCorta(venceEn)}`
          : `⭐ ${plan} · sin pagar`;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO[estado] || ESTILO.pendiente}`}>{texto}</span>;
}
