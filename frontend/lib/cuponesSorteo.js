import { imprimirEnAgente, agenteDisponible } from "@/lib/agenteImpresion";
import { lineasNombreEmpresa } from "@/lib/encabezadoEmpresa";

// Cupones del sorteo: un papel por cupon (un papel = una chance en el buzon).
// Se arman desde dos formas de datos: la respuesta de POST /api/ventas
// (camelCase, trae venta.cupones + venta.sorteo) y la de GET /api/ventas/:id
// (snake_case, cada cupon trae el sorteo).

export function numeroCupon(n) {
  return String(n).padStart(6, "0");
}

function fechaCorta(valor) {
  if (!valor) return null;
  const [y, m, d] = String(valor).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// -> { cupones: [{ numero, nombre, celular }], sorteo: { nombre, fechaSorteo, premios }, referencia, fecha } | null
export function datosDeCupones(venta) {
  const crudos = (venta?.cupones || []).filter((c) => !c.anulado);
  if (crudos.length === 0) return null;
  const primero = venta.cupones[0];
  const sorteo = venta.sorteo || {
    nombre: primero.sorteo_nombre,
    fechaSorteo: primero.fecha_sorteo,
    premios: primero.premios,
  };
  const referencia = venta.de_numero_formateado
    ? `Factura ${venta.de_numero_formateado}`
    : `Ticket N° ${venta.numeroTicket ?? venta.numero_ticket}`;
  return {
    cupones: crudos.map((c) => ({
      numero: c.numero,
      nombre: c.clienteNombre ?? c.cliente_nombre,
      celular: c.clienteCelular ?? c.cliente_celular,
    })),
    sorteo,
    referencia,
    fecha: new Date(venta.creadoEn ?? venta.creado_en),
  };
}

export function lineasCupon(empresa, datos, cupon) {
  const lineas = [
    ...lineasNombreEmpresa(empresa),
    { texto: "CUPON DE SORTEO", negrita: true, alineacion: "centro" },
    { texto: datos.sorteo.nombre, alineacion: "centro" },
    { texto: `N° ${numeroCupon(cupon.numero)}`, negrita: true, alineacion: "centro" },
    { texto: "--------------------------------" },
    { texto: `Nombre: ${cupon.nombre}`, negrita: true },
  ];
  if (cupon.celular) lineas.push({ texto: `Celular: ${cupon.celular}` });
  lineas.push(
    { texto: `${datos.referencia} - ${datos.fecha.toLocaleDateString("es-PY")}` },
    { texto: "--------------------------------" }
  );
  if (datos.sorteo.fechaSorteo) lineas.push({ texto: `Sorteo: ${fechaCorta(datos.sorteo.fechaSorteo)}`, alineacion: "centro" });
  if (datos.sorteo.premios) lineas.push({ texto: datos.sorteo.premios, alineacion: "centro" });
  lineas.push({ texto: "Deposite este cupon en el buzon", negrita: true, alineacion: "centro" });
  return lineas;
}

// Imprime todos los cupones: con el agente (un trabajo por cupon, asi cada
// papel sale cortado) si hay impresora configurada y disponible; si no,
// window.print() sobre el area oculta de <CuponesSorteo> (ver globals.css).
export async function imprimirCupones(empresa, venta) {
  const datos = datosDeCupones(venta);
  if (!datos) return;
  if (empresa?.impresora_agente_nombre) {
    try {
      if (await agenteDisponible()) {
        for (const cupon of datos.cupones) {
          await imprimirEnAgente(empresa.impresora_agente_nombre, lineasCupon(empresa, datos, cupon));
        }
        return;
      }
    } catch {
      // cae a la impresion del navegador
    }
  }
  document.body.dataset.imprimiendo = "cupones";
  const limpiar = () => {
    delete document.body.dataset.imprimiendo;
    window.removeEventListener("afterprint", limpiar);
  };
  window.addEventListener("afterprint", limpiar);
  window.print();
  // Por si el navegador no dispara afterprint.
  setTimeout(limpiar, 1000);
}
