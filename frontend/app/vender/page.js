"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { avanzarConEnter } from "@/lib/avanzarConEnter";
import CampoCantidad from "@/components/CampoCantidad";
import Recibo from "./Recibo";

const formatoGs = new Intl.NumberFormat("es-PY");

const CLAVE_VENTA_EN_CURSO = "empremas_venta_en_curso";

const TIPOS_PAGO = [
  { valor: "contado", etiqueta: "Contado" },
  { valor: "credito", etiqueta: "Crédito" },
  { valor: "mayorista", etiqueta: "Mayorista" },
];

const FORMAS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta de crédito" },
  { valor: "tarjeta_debito", etiqueta: "Tarjeta de débito" },
];

const TIPOS_COMPROBANTE = [
  { valor: "ticket_comun", etiqueta: "Ticket común", icono: "🧾" },
  { valor: "a4", etiqueta: "Hoja A4", icono: "📄" },
  { valor: "sin_comprobante", etiqueta: "Sin comprobante", icono: "🚫" },
];

const ICONO_FORMA_PAGO = {
  efectivo: "💵",
  transferencia: "🏦",
  tarjeta_credito: "💳",
  tarjeta_debito: "💳",
};

const ETIQUETA_FORMA_PAGO = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.etiqueta]));

function colorSaldo(disponible, linea) {
  if (linea <= 0) return "text-slate-400";
  if (disponible <= 0) return "text-red-600";
  if (disponible / linea < 0.2) return "text-amber-600";
  return "text-emerald-600";
}

// Un item que llegó de convertir un presupuesto trae su propio precio
// cotizado (posiblemente editado a mano) — ese precio se respeta en vez de
// recalcular con el precio de catálogo actual. Fuera de ese caso, un item
// marcado a mano como mayorista (o el beneficio automático de la categoría
// de fidelización del cliente elegido) usa ese precio en vez del de la
// lista general de la venta - pero solo si la venta es al contado (en
// crédito no aplica). Mismo cálculo que hace el servidor en crearVenta -
// se repite acá para que el cajero vea el total real ANTES de confirmar
// (necesita saber cuánto cobrar, no enterarse después del hecho).
function precioDe(item, tipoPago, beneficios) {
  if (item.precioFijo != null) return item.precioFijo;
  const usaMayorista =
    tipoPago === "contado" && (item.esMayorista || beneficios?.beneficioMayoristaAutomatico);
  let precio = usaMayorista ? item.precios.mayorista : item.precios[tipoPago];
  const descuentoPct = beneficios?.beneficioDescuentoAdicionalPct || 0;
  if (descuentoPct > 0) {
    precio = Math.round(precio * (1 - descuentoPct / 100));
  }
  return precio;
}

export default function Vender() {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  const [tipoPago, setTipoPago] = useState("contado");
  const [tipoComprobante, setTipoComprobante] = useState("ticket_comun");
  const [presupuestoId, setPresupuestoId] = useState(null);

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [buscandoClienteOpcional, setBuscandoClienteOpcional] = useState(false);
  // Productos mas comprados historicamente por el cliente elegido - capa
  // aparte de la sugerencia de venta cruzada (esa es sobre el producto,
  // esta es sobre la persona).
  const [productosFrecuentes, setProductosFrecuentes] = useState([]);

  // Alta rápida de cliente sin salir de Vender - para cuando el cliente
  // todavía no está cargado y no tiene sentido mandar al cajero a otra
  // pantalla en medio de una venta.
  const [creandoClienteRapido, setCreandoClienteRapido] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteDocumento, setNuevoClienteDocumento] = useState("");
  const [nuevoClienteCelular, setNuevoClienteCelular] = useState("");
  const [nuevoClienteLineaCredito, setNuevoClienteLineaCredito] = useState("");
  const [creandoCliente, setCreandoCliente] = useState(false);

  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [sugerencia, setSugerencia] = useState(null);

  // Pagos ya confirmados para esta venta (puede haber más de uno: ej. una
  // parte efectivo, otra parte tarjeta) + el que se está por agregar.
  const [pagos, setPagos] = useState([]);
  const [nuevoPagoForma, setNuevoPagoForma] = useState("");
  const [nuevoPagoMonto, setNuevoPagoMonto] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [empresaInfo, setEmpresaInfo] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [vendedorId, setVendedorId] = useState("");
  const [recibo, setRecibo] = useState(null);
  const [restaurado, setRestaurado] = useState(false);
  const [sifenConfigurado, setSifenConfigurado] = useState(false);
  // null = todavia no se sabe, false = no hay caja abierta, true = si.
  // Sin caja abierta no se puede vender - cada dia hay que abrirla y
  // cerrarla, para que el arqueo de caja tenga sentido.
  const [cajaAbierta, setCajaAbierta] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    apiFetch("/api/empresas/actual")
      .then(setEmpresaInfo)
      .catch((err) => setError(err.message));
    apiFetch("/api/empresas/sifen")
      .then((c) => setSifenConfigurado(c.configurado))
      .catch(() => {});
    apiFetch("/api/turnos/actual")
      .then((t) => setCajaAbierta(Boolean(t)))
      .catch(() => setCajaAbierta(false));

    // Si había una venta a medio cargar (ej. se fue a Stock a corregir un
    // precio), la recupera antes de que el efecto de guardado de abajo
    // pueda pisarla con el estado vacío inicial.
    const guardada = localStorage.getItem(CLAVE_VENTA_EN_CURSO);
    if (guardada) {
      try {
        const datos = JSON.parse(guardada);
        setTipoPago(datos.tipoPago ?? "contado");
        setTipoComprobante(datos.tipoComprobante ?? "ticket_comun");
        setPresupuestoId(datos.presupuestoId ?? null);
        setCliente(datos.cliente ?? null);
        setCarrito(datos.carrito ?? []);
        setPagos(datos.pagos ?? []);
        // El precio de cada item se guardó como foto del momento en que se
        // agregó al carrito. Si el carrito viene de "Ir a Stock a corregir
        // un precio", ese precio puede estar desactualizado — se refresca
        // contra el catálogo actual (salvo los que tienen precioFijo, que
        // vienen de un presupuesto cotizado y no se deben tocar).
        refrescarPreciosCarrito(datos.carrito ?? []);
      } catch {
        localStorage.removeItem(CLAVE_VENTA_EN_CURSO);
      }
    }

    setRestaurado(true);
    setListo(true);
  }, [router]);

  // Modulo de Vendedores por comision: lista de vendedores activos para
  // que el cajero elija a quien atribuir la venta cuando el cliente no
  // tiene uno propio asignado (ver seleccionarCliente).
  useEffect(() => {
    if (empresaInfo?.comisiones_habilitadas) {
      apiFetch("/api/vendedores?activo=true")
        .then(setVendedores)
        .catch(() => {});
    }
  }, [empresaInfo]);

  async function refrescarPreciosCarrito(carritoRestaurado) {
    const aRefrescar = carritoRestaurado.filter((i) => i.precioFijo == null);
    if (aRefrescar.length === 0) return;

    const actualizaciones = await Promise.all(
      aRefrescar.map(async (i) => {
        try {
          const p = await apiFetch(`/api/productos/${i.productoId}`);
          return {
            productoId: i.productoId,
            precios: {
              contado: Number(p.precio_contado),
              credito: Number(p.precio_credito),
              mayorista: Number(p.precio_mayorista),
            },
          };
        } catch {
          return null;
        }
      })
    );

    setCarrito((actual) =>
      actual.map((i) => {
        const actualizacion = actualizaciones.find((a) => a?.productoId === i.productoId);
        return actualizacion ? { ...i, precios: actualizacion.precios } : i;
      })
    );
  }

  // Guarda la venta en curso en cada cambio, para poder ir a otra pantalla
  // (ej. Stock, a corregir un precio) y volver sin perder el carrito.
  useEffect(() => {
    if (!restaurado) return;
    if (carrito.length === 0) {
      localStorage.removeItem(CLAVE_VENTA_EN_CURSO);
      return;
    }
    localStorage.setItem(
      CLAVE_VENTA_EN_CURSO,
      JSON.stringify({ tipoPago, tipoComprobante, presupuestoId, cliente, carrito, pagos })
    );
  }, [restaurado, tipoPago, tipoComprobante, presupuestoId, cliente, carrito, pagos]);

  function cambiarTipoPago(valor) {
    setTipoPago(valor);
    setCliente(null);
    setProductosFrecuentes([]);
    setBuscandoClienteOpcional(false);
    setVendedorId("");
    setPagos([]);
    setNuevoPagoForma("");
    setNuevoPagoMonto("");
  }

  async function ejecutarBusquedaCliente(q) {
    if (!q) {
      setResultadosCliente([]);
      return;
    }
    try {
      setResultadosCliente(await apiFetch(`/api/clientes?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function buscarCliente(e) {
    e.preventDefault();
    ejecutarBusquedaCliente(busquedaCliente);
  }

  const busquedaClienteDebounced = useDebounced(busquedaCliente);
  useEffect(() => {
    ejecutarBusquedaCliente(busquedaClienteDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaClienteDebounced]);

  function abrirClienteRapido() {
    setCreandoClienteRapido(true);
    setNuevoClienteNombre(busquedaCliente);
    setNuevoClienteDocumento("");
    setNuevoClienteCelular("");
    setNuevoClienteLineaCredito("");
  }

  async function crearClienteRapido(e) {
    e.preventDefault();
    setError("");
    setCreandoCliente(true);
    try {
      const nuevoCliente = await apiFetch("/api/clientes", {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevoClienteNombre,
          documento: nuevoClienteDocumento || undefined,
          celular: nuevoClienteCelular || undefined,
          lineaCredito: Number(nuevoClienteLineaCredito) || 0,
        }),
      });
      setCreandoClienteRapido(false);
      seleccionarCliente(nuevoCliente);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreandoCliente(false);
    }
  }

  function seleccionarCliente(c) {
    setCliente(c);
    setResultadosCliente([]);
    setBusquedaCliente("");
    setBuscandoClienteOpcional(false);
    setCreandoClienteRapido(false);
    setVendedorId("");
    cargarProductosFrecuentes(c);
  }

  // Capa personalizada de sugerencia: que productos compra siempre ESTE
  // cliente en particular (distinto de la venta cruzada general, que es
  // sobre el producto). No bloquea ni retrasa la seleccion del cliente.
  // Apagable desde Perfil de Empresa (algunos dueños la encuentran molesta
  // para una venta rapida) - default true, ya existia antes del casillero.
  async function cargarProductosFrecuentes(c) {
    if (empresaInfo?.sugerencias_venta_habilitadas === false) return;
    try {
      const productos = await apiFetch(`/api/clientes/${c.id}/productos-frecuentes`);
      setProductosFrecuentes(productos);
    } catch {
      setProductosFrecuentes([]);
    }
  }

  async function ejecutarBusquedaProducto(q) {
    if (!q) {
      setResultadosProducto([]);
      return;
    }
    try {
      setResultadosProducto(await apiFetch(`/api/productos?excluirInsumos=true&q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err.message);
    }
  }

  // Al tipear y tocar "Buscar" (o al leer un código con el lector, que
  // manda el mismo Enter) - si lo escrito matchea el código de barras
  // exacto de un solo producto, es una lectura de código, no una
  // búsqueda por nombre: se agrega directo al carrito (sumando si ya
  // estaba, vía agregarAlCarrito) sin exigir un clic extra por cada
  // unidad leída. Si hay varios resultados o ninguno matchea exacto,
  // sigue mostrando la lista para elegir a mano, como antes.
  async function buscarProducto(e) {
    e.preventDefault();
    const q = busquedaProducto;
    if (!q) return;
    try {
      const resultados = await apiFetch(`/api/productos?excluirInsumos=true&q=${encodeURIComponent(q)}`);
      const porCodigoExacto = resultados.filter((p) => p.codigo_barras === q);
      if (porCodigoExacto.length === 1) {
        agregarAlCarrito(porCodigoExacto[0]);
      } else {
        setResultadosProducto(resultados);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const busquedaProductoDebounced = useDebounced(busquedaProducto);
  useEffect(() => {
    ejecutarBusquedaProducto(busquedaProductoDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaProductoDebounced]);

  function agregarAlCarrito(p) {
    setCarrito((actual) => {
      const yaExiste = actual.find((i) => i.productoId === p.id);
      if (yaExiste) {
        return actual.map((i) =>
          i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [
        {
          productoId: p.id,
          nombre: p.nombre,
          unidadMedida: p.unidad_medida,
          cantidad: 1,
          precios: {
            contado: Number(p.precio_contado),
            credito: Number(p.precio_credito),
            mayorista: Number(p.precio_mayorista),
          },
          esMayorista: false,
        },
        ...actual,
      ];
    });
    setResultadosProducto([]);
    setBusquedaProducto("");
    cargarSugerencia(p);
  }

  // Venta cruzada: al agregar un producto, si tiene asociados configurados
  // (a mano o aprobados desde las sugerencias automáticas), se los ofrece
  // al cajero con un toque para sumarlos. No bloquea ni retrasa el agregado
  // al carrito - es un fetch aparte que reemplaza la sugerencia anterior
  // (o la limpia, si el producto recién agregado no tiene asociados).
  // Apagable desde Perfil de Empresa - ver cargarProductosFrecuentes.
  async function cargarSugerencia(p) {
    if (empresaInfo?.sugerencias_venta_habilitadas === false) return;
    try {
      const asociados = await apiFetch(`/api/productos/${p.id}/asociados`);
      setSugerencia(asociados.length > 0 ? { productoBase: p, asociados } : null);
    } catch {
      setSugerencia(null);
    }
  }

  function cambiarCantidad(productoId, cantidad) {
    setCarrito((actual) =>
      actual.map((i) => (i.productoId === productoId ? { ...i, cantidad: Number(cantidad) || 0 } : i))
    );
  }

  // Marca/desmarca un producto puntual del carrito para venderlo a precio
  // mayorista - solo tiene efecto real con tipoPago "contado" (ver
  // precioDe), pensado para cuando el cliente compra al menudeo pero se
  // lleva un producto puntual por cantidad (ej. una caja de cerveza).
  function alternarMayorista(productoId) {
    setCarrito((actual) =>
      actual.map((i) => (i.productoId === productoId ? { ...i, esMayorista: !i.esMayorista } : i))
    );
  }

  function quitarDelCarrito(productoId) {
    setCarrito((actual) => actual.filter((i) => i.productoId !== productoId));
  }

  const total = carrito.reduce(
    (acumulado, i) => acumulado + precioDe(i, tipoPago, cliente?.categoriaCliente) * i.cantidad,
    0
  );

  const totalPagado = pagos.reduce((acumulado, p) => acumulado + Number(p.monto), 0);
  const restante = total - totalPagado;

  function elegirFormaNuevoPago(valor) {
    setNuevoPagoForma(valor);
    setNuevoPagoMonto(String(Math.max(restante, 0)));
  }

  const excedeNoEfectivo =
    nuevoPagoForma && nuevoPagoForma !== "efectivo" && Number(nuevoPagoMonto) > restante;

  function agregarPago() {
    if (!nuevoPagoForma || !(Number(nuevoPagoMonto) > 0) || excedeNoEfectivo) return;
    setPagos((actual) => [...actual, { formaPago: nuevoPagoForma, monto: Number(nuevoPagoMonto) }]);
    setNuevoPagoForma("");
    setNuevoPagoMonto("");
  }

  function quitarPago(indice) {
    setPagos((actual) => actual.filter((_, i) => i !== indice));
  }

  const puedeAgregarProductos = tipoPago !== "credito" || cliente;
  const puedeConfirmar = carrito.length > 0 && (tipoPago === "credito" || (pagos.length > 0 && restante <= 0));

  // pagosParaEnviar por parametro (en vez de leer el estado "pagos"
  // directo) porque el cierre rapido (Ctrl+Enter) agrega el pago en
  // efectivo y confirma en el mismo gesto - si confirmarVenta leyera el
  // estado, todavia veria los pagos de antes de ese agregado (setState
  // es asincrono, no se refleja en el mismo tick).
  async function confirmarVenta(pagosParaEnviar = pagos) {
    setError("");
    setEnviando(true);
    try {
      const venta = await apiFetch("/api/ventas", {
        method: "POST",
        body: JSON.stringify({
          tipoPago,
          tipoComprobante,
          presupuestoId,
          clienteId: cliente?.id,
          vendedorId: cliente?.vendedorAsignado?.id || vendedorId || null,
          pagos: pagosParaEnviar,
          items: carrito.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            precioUnitario: i.precioFijo,
            esMayorista: i.esMayorista,
          })),
        }),
      });
      localStorage.removeItem(CLAVE_VENTA_EN_CURSO);
      setRecibo({
        venta,
        formato: tipoComprobante,
        cliente: cliente
          ? { nombre: cliente.nombre, documento: cliente.documento, celular: cliente.celular, direccion: cliente.direccion }
          : { nombre: "Consumidor Final" },
        items: carrito.map((i) => ({
          productoId: i.productoId,
          nombre: i.nombre,
          cantidad: i.cantidad,
          precioUnitario: precioDe(i, tipoPago, cliente?.categoriaCliente),
          unidadMedida: i.unidadMedida,
          esMayorista: tipoPago === "contado" && !!i.esMayorista,
        })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  // Atajo de cierre rápido, un solo gesto de teclado sin bajar con el
  // cursor hasta el botón. Contado/mayorista (Ctrl+Enter): completa el
  // pago en efectivo por lo que falte y confirma - si ya se cargó algún
  // pago a mano (parcial o con otra forma de pago), no lo pisa, solo
  // cubre el resto con efectivo. Crédito (Ctrl+Shift+Enter, el Shift de
  // más a propósito - fiar toda la venta es una acción de más peso que
  // cobrar en efectivo, no conviene que salga con la misma combinación
  // liviana): confirma directo con los pagos ya cargados (si no se cargó
  // ninguno, el total completo queda fiado - ya es lo que hace el botón
  // "Confirmar venta" en este caso, el atajo solo evita tener que
  // clickearlo).
  function cierreRapido() {
    if (enviando || carrito.length === 0) return;
    if (tipoPago === "credito") {
      confirmarVenta(pagos);
      return;
    }
    const pagosFinal = restante > 0 ? [...pagos, { formaPago: "efectivo", monto: restante }] : pagos;
    setPagos(pagosFinal);
    confirmarVenta(pagosFinal);
  }

  useEffect(() => {
    function alPresionarTecla(e) {
      if (!(e.ctrlKey && e.key === "Enter")) return;
      if (tipoPago === "credito" && !e.shiftKey) return;
      if (tipoPago !== "credito" && e.shiftKey) return;
      e.preventDefault();
      if (recibo || cajaAbierta === false) return;
      cierreRapido();
    }
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enviando, carrito, tipoPago, restante, pagos, recibo, cajaAbierta]);

  function nuevaVenta() {
    localStorage.removeItem(CLAVE_VENTA_EN_CURSO);
    setRecibo(null);
    setCarrito([]);
    setCliente(null);
    setProductosFrecuentes([]);
    setBuscandoClienteOpcional(false);
    setVendedorId("");
    setPagos([]);
    setNuevoPagoForma("");
    setNuevoPagoMonto("");
    setTipoPago("contado");
    setTipoComprobante("ticket_comun");
    setPresupuestoId(null);
    setError("");
  }

  if (!listo) return null;

  if (cajaAbierta === false) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg shadow-slate-200">
          <p className="text-5xl">🔒</p>
          <h1 className="mt-4 text-xl font-bold text-navy">Abrí la caja para vender</h1>
          <p className="mt-2 text-slate-500">
            Todavía no abriste la caja hoy. Cada día hay que abrirla antes de vender y cerrarla al terminar.
          </p>
          <Link
            href="/caja"
            className="mt-6 inline-block w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-light"
          >
            Abrir caja
          </Link>
          <Link href="/panel" className="mt-3 block text-sm font-medium text-slate-500 hover:text-slate-700">
            ← Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  if (recibo) {
    return (
      <main className="flex flex-1 flex-col items-center p-6">
        <div className="w-full max-w-2xl">
          <div className="py-6">
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Venta registrada</h1>
          </div>
          {empresaInfo && (
            <Recibo
              empresa={empresaInfo}
              venta={recibo.venta}
              cliente={recibo.cliente}
              items={recibo.items}
              formato={recibo.formato}
              autoImprimir
              onNuevaVenta={nuevaVenta}
            />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-start justify-between py-6">
          <div>
            <Link href="/panel" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Volver
            </Link>
            <h1 className="text-2xl font-bold text-navy">Vender</h1>
          </div>
          <div className="text-right">
            {carrito.length > 0 && (
              <Link
                href="/stock"
                className="block text-sm font-semibold text-navy hover:text-brand"
              >
                Ir a Stock a corregir un precio
                <br />
                <span className="font-normal text-slate-400">tu carrito queda guardado</span>
              </Link>
            )}
            <Link href="/presupuestos" className="block text-sm font-semibold text-navy hover:text-brand">
              Presupuestos
            </Link>
            <Link href="/ventas" className="block text-sm font-semibold text-navy hover:text-brand">
              Ventas
            </Link>
          </div>
        </div>

        {carrito.length > 0 && (
          <div className="sticky top-0 z-30 mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-md backdrop-blur">
            <p className="text-sm font-semibold text-slate-500">Total</p>
            <p className="text-2xl font-extrabold text-navy">Gs {formatoGs.format(total)}</p>
          </div>
        )}

        <div className="mb-4 flex gap-2">
          {TIPOS_PAGO.map((t) => (
            <button
              key={t.valor}
              onClick={() => cambiarTipoPago(t.valor)}
              className={`flex-1 rounded-xl py-3 text-lg font-bold transition ${
                tipoPago === t.valor
                  ? "bg-navy text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>

        {tipoPago === "credito" && !cliente && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <p className="mb-3 font-semibold text-slate-700">
              Elegí el cliente antes de cargar productos
            </p>
            <form onSubmit={buscarCliente} className="flex gap-2">
              <input
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                placeholder="Buscar por nombre, cédula o RUC..."
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
                Buscar
              </button>
            </form>
            {resultadosCliente.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {resultadosCliente.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => seleccionarCliente(c)}
                    className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-semibold">{c.nombre}</span>{" "}
                    <span className="text-sm text-slate-400">{c.documento}</span>
                  </button>
                ))}
              </div>
            )}

            {creandoClienteRapido ? (
              <form onSubmit={crearClienteRapido} onKeyDown={avanzarConEnter} className="mt-3 rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">Cliente nuevo</p>
                <input
                  required
                  value={nuevoClienteNombre}
                  onChange={(e) => setNuevoClienteNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                  autoFocus
                  className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                <div className="mb-2 flex gap-2">
                  <input
                    value={nuevoClienteDocumento}
                    onChange={(e) => setNuevoClienteDocumento(e.target.value)}
                    placeholder="Cédula/RUC (opcional)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                  <input
                    value={nuevoClienteCelular}
                    onChange={(e) => setNuevoClienteCelular(e.target.value)}
                    placeholder="Celular (opcional)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                </div>
                <input
                  type="number"
                  min="0"
                  value={nuevoClienteLineaCredito}
                  onChange={(e) => setNuevoClienteLineaCredito(e.target.value)}
                  placeholder="Línea de crédito (Gs)"
                  className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreandoClienteRapido(false)}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creandoCliente}
                    className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                  >
                    {creandoCliente ? "Creando..." : "Crear y usar este cliente"}
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={abrirClienteRapido} className="mt-3 text-sm font-semibold text-navy hover:text-brand">
                + Crear cliente nuevo
              </button>
            )}
          </div>
        )}

        {tipoPago === "credito" && cliente && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow shadow-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-lg font-bold text-slate-800">
                  {cliente.nombre}
                  {cliente.categoriaCliente && (
                    <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy">
                      {cliente.categoriaCliente.nombre}
                    </span>
                  )}
                </p>
                {empresaInfo?.comisiones_habilitadas &&
                  (cliente.vendedorAsignado ? (
                    <p className="text-xs text-slate-400">Vendedor: {cliente.vendedorAsignado.nombre}</p>
                  ) : (
                    vendedores.length > 0 && (
                      <select
                        value={vendedorId}
                        onChange={(e) => setVendedorId(e.target.value)}
                        className="mb-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">Vendedor (opcional)</option>
                        {vendedores.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nombre}
                          </option>
                        ))}
                      </select>
                    )
                  ))}
                <button
                  onClick={() => {
                    setCliente(null);
                    setProductosFrecuentes([]);
                    setVendedorId("");
                  }}
                  className="text-sm font-medium text-navy hover:text-brand"
                >
                  Cambiar cliente
                </button>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-extrabold ${colorSaldo(cliente.saldo_disponible, cliente.linea_credito)}`}>
                  Gs {formatoGs.format(cliente.saldo_disponible)}
                </p>
                <p className="text-sm text-slate-400">crédito disponible</p>
              </div>
            </div>
            {productosFrecuentes.length > 0 && (
              <div className="mt-3 rounded-xl bg-tint p-3">
                <p className="mb-2 text-sm text-navy">Este cliente suele llevar:</p>
                <div className="flex flex-wrap gap-2">
                  {productosFrecuentes.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => agregarAlCarrito(p)}
                      className="rounded-xl border border-navy/30 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/10"
                    >
                      + {p.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {puedeAgregarProductos && (
          <div className="rounded-2xl bg-white p-5 shadow shadow-slate-200" onKeyDown={avanzarConEnter}>
            <form onSubmit={buscarProducto} className="mb-3 flex gap-2">
              <input
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                placeholder="Buscar producto por nombre o código de barras..."
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
                Buscar
              </button>
            </form>

            {resultadosProducto.length > 0 && (
              <div className="mb-4 flex flex-col gap-2">
                {resultadosProducto.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregarAlCarrito(p)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="text-right text-slate-500">
                      <span className="block">Gs {formatoGs.format(p[`precio_${tipoPago}`])}</span>
                      <span className="block text-xs">stock {formatoGs.format(p.stock)} {p.unidad_medida}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {sugerencia && (
              <div className="mb-4 rounded-xl bg-tint p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-navy">
                    Los clientes que llevan <span className="font-semibold">{sugerencia.productoBase.nombre}</span> también
                    compran:
                  </p>
                  <button onClick={() => setSugerencia(null)} className="text-sm text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sugerencia.asociados.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => agregarAlCarrito(a)}
                      className="rounded-xl border border-navy/30 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/10"
                    >
                      + {a.nombre} · Gs {formatoGs.format(a[`precio_${tipoPago}`])}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {carrito.length === 0 ? (
              <p className="py-10 text-center text-slate-400">Carrito vacío — buscá un producto para empezar</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {carrito.map((i) => (
                  <div key={i.productoId} className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{i.nombre}</p>
                      <p className="text-sm text-slate-400">
                        Gs {formatoGs.format(precioDe(i, tipoPago, cliente?.categoriaCliente))} / {i.unidadMedida}
                        {i.precioFijo != null && <span className="ml-1 text-navy">(precio cotizado)</span>}
                      </p>
                      {tipoPago === "contado" && i.precioFijo == null && (
                        <button
                          onClick={() => alternarMayorista(i.productoId)}
                          className={`mt-1 rounded-full px-2 py-0.5 text-xs font-semibold transition ${
                            i.esMayorista ? "bg-navy text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {i.esMayorista ? "✓ A precio mayorista" : "Vender a precio mayorista"}
                        </button>
                      )}
                    </div>
                    <CampoCantidad
                      value={i.cantidad}
                      onChange={(valor) => cambiarCantidad(i.productoId, valor)}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-center text-lg"
                    />
                    <p className="w-28 text-right font-bold text-slate-800">
                      Gs {formatoGs.format(precioDe(i, tipoPago, cliente?.categoriaCliente) * i.cantidad)}
                    </p>
                    <button
                      onClick={() => quitarDelCarrito(i.productoId)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {carrito.length > 0 && (
              <>
                {tipoPago !== "credito" && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    {cliente ? (
                      <div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-slate-400">Cliente</p>
                            <p className="flex items-center gap-2 font-semibold text-slate-800">
                              {cliente.nombre}
                              {cliente.categoriaCliente && (
                                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy">
                                  {cliente.categoriaCliente.nombre}
                                </span>
                              )}
                            </p>
                            {empresaInfo?.comisiones_habilitadas &&
                              (cliente.vendedorAsignado ? (
                                <p className="text-xs text-slate-400">Vendedor: {cliente.vendedorAsignado.nombre}</p>
                              ) : (
                                vendedores.length > 0 && (
                                  <select
                                    value={vendedorId}
                                    onChange={(e) => setVendedorId(e.target.value)}
                                    className="mt-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                  >
                                    <option value="">Vendedor (opcional)</option>
                                    {vendedores.map((v) => (
                                      <option key={v.id} value={v.id}>
                                        {v.nombre}
                                      </option>
                                    ))}
                                  </select>
                                )
                              ))}
                          </div>
                          <button
                            onClick={() => {
                              setCliente(null);
                              setProductosFrecuentes([]);
                              setVendedorId("");
                            }}
                            className="text-sm font-medium text-red-500 hover:text-red-700"
                          >
                            Quitar
                          </button>
                        </div>
                        {productosFrecuentes.length > 0 && (
                          <div className="mt-3 rounded-xl bg-tint p-3">
                            <p className="mb-2 text-sm text-navy">Este cliente suele llevar:</p>
                            <div className="flex flex-wrap gap-2">
                              {productosFrecuentes.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => agregarAlCarrito(p)}
                                  className="rounded-xl border border-navy/30 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/10"
                                >
                                  + {p.nombre}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : buscandoClienteOpcional ? (
                      <div>
                        <form onSubmit={buscarCliente} className="flex gap-2">
                          <input
                            value={busquedaCliente}
                            onChange={(e) => setBusquedaCliente(e.target.value)}
                            placeholder="Buscar por nombre, cédula o RUC..."
                            autoFocus
                            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                          />
                          <button type="submit" className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
                            Buscar
                          </button>
                        </form>
                        {resultadosCliente.length > 0 && (
                          <div className="mt-3 flex flex-col gap-2">
                            {resultadosCliente.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => seleccionarCliente(c)}
                                className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                              >
                                <span className="font-semibold">{c.nombre}</span>{" "}
                                <span className="text-sm text-slate-400">{c.documento}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {creandoClienteRapido ? (
                          <form onSubmit={crearClienteRapido} onKeyDown={avanzarConEnter} className="mt-3 rounded-xl border border-slate-200 p-3">
                            <p className="mb-2 text-sm font-semibold text-slate-700">Cliente nuevo</p>
                            <input
                              required
                              value={nuevoClienteNombre}
                              onChange={(e) => setNuevoClienteNombre(e.target.value)}
                              placeholder="Nombre y apellido"
                              autoFocus
                              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                            />
                            <div className="mb-2 flex gap-2">
                              <input
                                value={nuevoClienteDocumento}
                                onChange={(e) => setNuevoClienteDocumento(e.target.value)}
                                placeholder="Cédula/RUC (opcional)"
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                              />
                              <input
                                value={nuevoClienteCelular}
                                onChange={(e) => setNuevoClienteCelular(e.target.value)}
                                placeholder="Celular (opcional)"
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setCreandoClienteRapido(false)}
                                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                disabled={creandoCliente}
                                className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                              >
                                {creandoCliente ? "Creando..." : "Crear y usar este cliente"}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button onClick={abrirClienteRapido} className="mt-3 text-sm font-semibold text-navy hover:text-brand">
                            + Crear cliente nuevo
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setBuscandoClienteOpcional(true)}
                        className="text-sm font-semibold text-navy hover:text-brand"
                      >
                        + Asociar un cliente a esta venta (opcional)
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="mb-2 text-sm font-medium text-slate-500">
                      {tipoPago === "credito" ? "Entrega inicial (opcional)" : "Forma de cobro"}
                    </p>
                    {tipoPago === "credito" && (
                      <p className="mb-2 text-xs text-slate-400">
                        Si el cliente paga una parte ahora, cargá acá cuánto — el resto queda fiado.
                      </p>
                    )}

                    {pagos.length > 0 && (
                      <div className="mb-3 flex flex-col gap-2">
                        {pagos.map((p, indice) => (
                          <div
                            key={indice}
                            className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2"
                          >
                            <span className="font-semibold text-slate-700">
                              {ETIQUETA_FORMA_PAGO[p.formaPago]}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-700">
                                Gs {formatoGs.format(p.monto)}
                              </span>
                              <button
                                onClick={() => quitarPago(indice)}
                                className="text-red-500 hover:text-red-700"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {restante > 0 ? (
                      <>
                        {pagos.length > 0 && (
                          <p className="mb-2 text-sm font-semibold text-amber-600">
                            {tipoPago === "credito"
                              ? `Queda fiado: Gs ${formatoGs.format(restante)}`
                              : `Falta cubrir: Gs ${formatoGs.format(restante)}`}
                          </p>
                        )}
                        <div className="grid grid-cols-4 gap-1.5">
                          {FORMAS_PAGO.map((f) => (
                            <button
                              key={f.valor}
                              onClick={() => elegirFormaNuevoPago(f.valor)}
                              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition ${
                                nuevoPagoForma === f.valor
                                  ? "bg-navy text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              <span className="text-lg leading-none">{ICONO_FORMA_PAGO[f.valor]}</span>
                              <span className="text-center text-[11px] font-semibold leading-tight">{f.etiqueta}</span>
                            </button>
                          ))}
                        </div>

                        {nuevoPagoForma && (
                          <div className="mt-3">
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                              Monto {ETIQUETA_FORMA_PAGO[nuevoPagoForma].toLowerCase()} (Gs)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={nuevoPagoMonto}
                              onChange={(e) => setNuevoPagoMonto(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                              placeholder="0"
                            />
                            {excedeNoEfectivo && (
                              <p className="mt-2 text-sm font-semibold text-red-600">
                                No podés cobrar más del total con {ETIQUETA_FORMA_PAGO[nuevoPagoForma].toLowerCase()} — el excedente solo se puede dar como vuelto en efectivo
                              </p>
                            )}
                            {nuevoPagoForma === "efectivo" &&
                              Number(nuevoPagoMonto) > restante && (
                                <p className="mt-2 text-sm font-semibold text-emerald-600">
                                  Vuelto: Gs {formatoGs.format(Number(nuevoPagoMonto) - restante)}
                                </p>
                              )}
                            <button
                              onClick={agregarPago}
                              disabled={!(Number(nuevoPagoMonto) > 0) || excedeNoEfectivo}
                              className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-light disabled:opacity-50"
                            >
                              Agregar {ETIQUETA_FORMA_PAGO[nuevoPagoForma].toLowerCase()}
                            </button>
                          </div>
                        )}
                      </>
                    ) : pagos.length > 0 ? (
                      <p className="text-lg font-bold text-emerald-600">
                        {restante < 0
                          ? `Vuelto: Gs ${formatoGs.format(-restante)}`
                          : tipoPago === "credito"
                          ? "Se cobra todo ahora — no queda saldo fiado"
                          : "Total cubierto"}
                      </p>
                    ) : null}
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="mb-2 text-sm font-medium text-slate-500">Comprobante</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {TIPOS_COMPROBANTE.map((t) => (
                      <button
                        key={t.valor}
                        onClick={() => setTipoComprobante(t.valor)}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition ${
                          tipoComprobante === t.valor
                            ? "bg-navy text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <span className="text-lg leading-none">{t.icono}</span>
                        <span className="text-center text-[11px] font-semibold leading-tight">{t.etiqueta}</span>
                      </button>
                    ))}
                    <button
                      disabled={!sifenConfigurado}
                      title={sifenConfigurado ? undefined : "Necesita configurar SIFEN (Configuración → Facturación electrónica)"}
                      onClick={() => setTipoComprobante("factura_legal")}
                      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition ${
                        !sifenConfigurado
                          ? "cursor-not-allowed bg-slate-50 text-slate-300"
                          : tipoComprobante === "factura_legal"
                          ? "bg-navy text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <span className="text-lg leading-none">📋</span>
                      <span className="text-center text-[11px] font-semibold leading-tight">
                        Factura Legal{!sifenConfigurado ? " (no config.)" : ""}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                  <p className="text-lg font-semibold text-slate-600">Total</p>
                  <p className="text-3xl font-extrabold text-navy">Gs {formatoGs.format(total)}</p>
                </div>

                {error && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}
                <button
                  onClick={() => confirmarVenta()}
                  disabled={enviando || !puedeConfirmar}
                  className="mt-4 w-full rounded-xl bg-brand py-4 text-xl font-bold text-white transition hover:bg-brand-light disabled:opacity-60"
                >
                  {enviando ? "Guardando..." : "Confirmar venta"}
                </button>
                <p className="mt-2 text-center text-xs text-slate-400">
                  {tipoPago === "credito"
                    ? "Atajo: Ctrl+Shift+Enter fía toda la venta y confirma de una"
                    : "Atajo: Ctrl+Enter cobra en efectivo y confirma de una"}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
