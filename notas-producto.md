# Notas de producto — observaciones reales de Mario como usuario de FlexPDV

Estas notas se van juntando a medida que Mario usa su sistema actual día a
día y detecta cosas que EMPREMAS debería hacer distinto. Sirven de insumo
para cuando lleguemos al diseño de cada pantalla (no se construyen todavía).

## Pantalla de venta / carrito (2026-08-07)

Referencia: captura de FlexPDV, pantalla de Ventas.

- El carrito de compra se ve muy chico (columna angosta a la derecha),
  aunque sea la parte más importante de la pantalla durante el cobro.
- Pedido: que el carrito pueda ocupar casi toda la pantalla, centrado,
  cuando se lo necesite ver grande.
- Pero debe poder minimizarse/volver a su tamaño normal para poder seguir
  viendo el catálogo de productos y corregir o agregar algo sin perder de
  vista el carrito.
- Aplica directamente a la "Regla de oro del punto de venta" ya definida:
  el carrito grande es también donde se mostraría el crédito/saldo del
  cliente a crédito.
- **Resuelto (2026-08-08):** el caso concreto que motivó el pedido de
  "minimizar" — estar vendiendo, notar que el precio de un producto está
  mal, ir a Stock a corregirlo y volver a la venta sin perder el carrito —
  ya funciona. El carrito se guarda automáticamente (localStorage) mientras
  hay algo cargado, y hay un link "Ir a Stock a corregir un precio" directo
  desde la pantalla de Vender. La idea de un panel que literalmente se
  minimiza/expande dentro de la misma pantalla queda pendiente como mejora
  visual, pero el problema real (no perder la venta) ya no existe.
- El buscador de producto (por código de barras o por nombre) debería estar
  **dentro del carrito**, no separado — a diferencia de FlexPDV donde el
  buscador está arriba de todo, afuera del panel del carrito.

## Dónde encajan remisión, presupuesto y recibo de cobro (2026-08-07)

Decisión de diseño, para no romper la regla de "máximo 3-4 botones grandes"
en la pantalla principal (Vender, Fiado/Crédito, Stock, Cerrar caja):

- **Remisión y presupuesto**: no son botones nuevos. Son un selector de
  "tipo de documento" dentro del flujo de "Vender", justo antes de
  confirmar (Factura / Remisión / Presupuesto). Es la misma pantalla de
  carga de productos, solo cambia qué se emite al final.
- **Recibo de cobro**: no es un botón nuevo. Se genera automáticamente
  dentro de "Fiado / Crédito", en el momento en que se registra un pago del
  cliente sobre su deuda — ahí es donde ocurre el cobro en la realidad, no
  hace falta una pantalla aparte.

## Funcionalidades pendientes (backlog, todavía no construidas)

- **Importación masiva de productos**: cargar un archivo (CSV/Excel) con
  columnas correspondientes a los campos del catálogo (nombre, código de
  barras, unidad de medida, los 3 precios, tasa de IVA, stock) para dar de
  alta muchos productos de una sola vez, en vez de uno por uno. Importante
  para el onboarding real de un comercio con miles de productos (ej. el
  "TODOS (3436)" que se ve en la captura de FlexPDV). Falta definir: formato
  exacto de columnas, qué pasa si un código de barras ya existe (¿actualiza
  o rechaza?), y si hay una plantilla descargable de ejemplo.
- **Autocompletar datos de cliente desde el RUC/CI vía SIFEN**: cuando haya
  integración con el SIFEN, ingresar la cédula o RUC en el formulario de
  cliente nuevo debería traer automáticamente el nombre y demás datos
  fiscales, en vez de tipearlos a mano. Por eso el formulario ya se
  reordenó (2026-08-08) para pedir cédula/RUC como primer campo, antes que
  el nombre — dejando el flujo listo para ese autocompletado futuro.
- **Configuración "permitir vender sin stock"**: agregar un interruptor a
  nivel empresa (probablemente en `empresas`, ej. columna
  `permitir_venta_sin_stock`) para que el dueño decida si el POS bloquea o
  no una venta cuando el producto no tiene stock suficiente. Hoy
  (2026-08-08) el backend de Vender SIEMPRE bloquea si falta stock — falta
  agregar el configurable y la pantalla para activarlo/desactivarlo.

## Referencia: pantalla "Cobro Rápido" de FlexPDV (2026-08-08)

Captura de referencia para diseñar nuestra pantalla de cierre de venta.
Estructura de FlexPDV, en 3 pasos dentro de la misma pantalla:

1. **Cliente** (RUC + nombre, con botón "+" para agregar uno nuevo ahí
   mismo) — el texto dice "Seleccionar habilita emisión de facturas"
   (o sea: sin cliente no se puede emitir factura, solo ticket).
2. **Forma de Cobro**: grilla de íconos — Efectivo, Débito, Crédito, QR,
   PIX, Transferencia, Giros, Cheque. Más opciones que las 4 que
   implementamos (nos falta QR, PIX, Giros, Cheque — evaluar cuáles
   aplican en Paraguay/al rubro).
3. **Tipo de Comprobante**: dos columnas — normal (Ticket en rollo / A4
   hoja tamaño A4 / Imagen) y su versión "Factura" (Factura Ticket /
   Factura A4 / Factura Imagen), esta última en gris hasta elegir
   cliente ("Requiere cliente"). Además un botón "Sin Comprobante"
   (cobra sin emitir ticket ni factura).
4. Total a Cobrar, grande, abajo de todo.

Confirmado con Mario: usa impresora térmica (ticket en rollo) para el
día a día Y una Epson grande para A4 cuando factura a instituciones —
las dos modalidades de impresión son reales y hace falta soportarlas.
"Imagen" (compartir por WhatsApp) es la tercera modalidad, sin
impresora de por medio.

Pendiente de construir: la propia pantalla de cierre con esta
estructura (cliente + forma de cobro + tipo de comprobante en un solo
paso), y los 3 formatos de salida (ticket térmico angosto, A4, imagen).
