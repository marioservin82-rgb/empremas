const formatoGs = new Intl.NumberFormat("es-PY");

export function fechaLarga(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export const ETIQUETA_ESTADO = {
  activa: "Activa",
  gracia: "En gracia",
  vencida: "Vencida",
  pendiente: "Sin pagar",
  cancelada: "Cancelada",
};

export const ESTILO_ESTADO = {
  activa: "bg-emerald-100 text-emerald-700",
  gracia: "bg-amber-100 text-amber-700",
  vencida: "bg-red-100 text-red-700",
  pendiente: "bg-slate-200 text-slate-600",
  cancelada: "bg-slate-100 text-slate-400",
};

// Mensaje de WhatsApp para recordar la cuota (se abre con linkWhatsapp; el
// usuario lo puede editar antes de enviarlo).
export function mensajeMembresia(m, nombreEmpresa) {
  const nombre = (m.clienteNombre || "").split(" ")[0] || "";
  const vence = fechaLarga(m.venceEn);
  const monto = `Gs ${formatoGs.format(m.precioMensual)}`;
  if (m.estado === "pendiente") {
    return `Hola ${nombre}, tu membresía ${m.planNombre} en ${nombreEmpresa} está lista. Para activarla falta abonar la primera cuota (${monto}). ¡Te esperamos!`;
  }
  if (m.estado === "gracia") {
    return `Hola ${nombre}, tu membresía ${m.planNombre} venció el ${vence}. Todavía estás a tiempo de renovarla (${monto}) para no perder tus beneficios en ${nombreEmpresa}.`;
  }
  if (m.estado === "vencida") {
    return `Hola ${nombre}, tu membresía ${m.planNombre} en ${nombreEmpresa} está vencida desde el ${vence}. Renovala (${monto}) cuando quieras para volver a disfrutar de tus beneficios.`;
  }
  return `Hola ${nombre}, te avisamos que tu membresía ${m.planNombre} en ${nombreEmpresa} vence el ${vence}. Podés renovarla (${monto}) cuando pases por el local. ¡Gracias por elegirnos!`;
}

// Carga en Vender la cuota de una membresia (mismo mecanismo que "Cobrar" una
// cita): carrito con el servicio de la cuota al precio del plan y el cliente.
export function guardarCuotaEnVender(m, cliente) {
  localStorage.setItem(
    "empremas_venta_en_curso",
    JSON.stringify({
      tipoPago: "contado",
      tipoComprobante: "ticket_comun",
      membresiaId: m.id,
      cliente,
      carrito: [
        {
          productoId: m.planProductoId,
          nombre: `Cuota Membresía ${m.planNombre}`,
          unidadMedida: "unidad",
          cantidad: 1,
          precioFijo: m.precioMensual,
          precios: { contado: m.precioMensual, credito: m.precioMensual, mayorista: m.precioMensual },
        },
      ],
      pagos: [],
    })
  );
}
