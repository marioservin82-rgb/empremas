# Diseño: Membresías para salones y barberías

> **Estado:** tanda 1 (control de pagos) y tanda 2 (descuento automático en servicios) implementadas. Falta la tanda 3 (reportes y extras).
>
> Reglas aplicadas en la tanda 2: el descuento de membresía y el de categoría de cliente no se suman (se aplica el mayor); un descuento manual se suma al de membresía; el servidor lo calcula sin pedir PIN; la comisión del profesional se calcula sobre el precio sin descuento.

## Qué problema resuelve

Un salón o barbería quiere ofrecer **membresías**: el cliente paga una cuota mensual y, mientras esté al día, recibe beneficios. Lo central es el **control de los pagos de la membresía**: quién está al día, a quién le vence y quién debe.

Hoy en EMPREMAS no existe nada parecido. Lo más cercano son los anticipos y las categorías de cliente por volumen de compra.

## Decisiones tomadas

- **Beneficios:** descuento en servicios y prioridad (una insignia visible para el personal; no cambia precios).
- **Cobro:** manual cada mes, con comprobante numerado.
- **Vencimiento:** 30 días desde cada pago.
- **Mora:** días de gracia configurables; pasado ese plazo se suspenden los beneficios.
- **Módulo opcional por empresa**, que se activa desde el panel admin, igual que sorteos y citas.

## Idea central

La cuota se cobra como una **venta normal** de un servicio "Membresía X". Cada pago de cuota queda registrado en una tabla propia con su período. El estado de la membresía **no se guarda: se calcula** a partir del último período pagado.

Así se reutiliza todo lo que ya existe: ticket numerado, caja, cuentas bancarias, factura legal opcional y anulación. No hay un segundo circuito de plata que mantener sincronizado.

## Datos

Todo con aislamiento por empresa, como el resto del sistema.

- `empresas.membresias_habilitadas`: apagado por defecto; lo prende el admin.
- **Planes** (`membresia_planes`): nombre (ej. "Oro"), precio mensual, % de descuento en servicios, días de gracia (por defecto 5), descripción y activo. Cada plan tiene un servicio "Cuota Membresía Oro" que se crea solo al crear el plan; el dueño elige la tasa de IVA y el precio sigue al del plan.
- **Membresías** (`membresias`): una por cliente y plan, con fecha de alta, notas y la opción de cancelar. Como máximo una vigente por cliente.
- **Pagos** (`membresia_pagos`): membresía, venta, período desde/hasta, monto y si fue anulado. Es la **fuente de verdad del vencimiento**.

## Reglas

- **Período:** cada cuota cubre 30 días. Si la membresía está vigente, el nuevo período empieza cuando termina el actual (pagar antes no pierde días). Si ya estaba vencida, empieza el día del pago.
- **Estado (se calcula al leer, sin tareas programadas):**
  - *Activa*: hoy es igual o anterior al vencimiento.
  - *En gracia*: hasta los días de gracia después del vencimiento.
  - *Vencida*: pasó la gracia; los beneficios quedan suspendidos.
  - *Cancelada*: cancelada a mano.
  - *Pendiente de primer pago*: todavía no pagó ninguna cuota.
- **Beneficios:** el descuento aplica en *Activa* y *En gracia*, no en *Vencida*. La prioridad es solo la insignia "⭐ Miembro".
- **La cuota solo se cobra al contado o por transferencia.** No se puede fiar, porque daría el período sin haber cobrado.
- **Si se anula la venta de la cuota**, el pago queda anulado y el vencimiento vuelve solo al período anterior.

## Cómo se integra con lo que ya existe

- **Cobrar la cuota:** botón "Cobrar cuota" en la membresía. Abre Vender con el servicio de la cuota y el cliente ya elegidos, igual que cobrar una cita. Vender envía el identificador de la membresía y, al confirmar la venta, el servidor registra el pago de la cuota en la misma operación. Si algo falla, no se cobra ni se renueva nada.
- **Descuento en servicios:** el servidor lo calcula (no el navegador) y lo aplica como descuento de línea con el motivo "Membresía Oro (10%)", sin pedir PIN. Funciona también sobre el precio fijo de una cita. La cuota en sí no recibe descuento. Vender muestra el mismo total en pantalla.
- **Insignia:** la ficha del cliente incluye su membresía (plan, estado, vencimiento y descuento), así que la muestran Vender, la lista de clientes y la agenda de citas.
- **Recordatorios:** botón manual de WhatsApp con un texto editable ("Hola [Nombre], tu membresía [Plan] vence el [fecha]…"), como los recordatorios de cobro y cumpleaños.
- **Módulo:** se activa por empresa desde el panel admin, con enlace en el panel del dueño.

## Pantallas

1. **Membresías** (dueño y encargado): lista con estado y vencimiento; filtros *Por vencer / En gracia / Vencidas*; nueva membresía; cobrar cuota; recordar; cancelar.
2. **Planes** (solo dueño): crear y editar planes.
3. **Insignia** "⭐ Miembro · vence 15/12" en Vender, agenda y lista de clientes.
4. **Historial de pagos** de cada membresía, con los períodos pagados y el número de ticket.

## Entrega por fases

1. **Control de pagos:** módulo, planes, membresías, cobro de cuota, estado calculado, insignia y lista con recordatorios por WhatsApp.
2. **Beneficios:** descuento automático en servicios e insignia en la agenda.
3. **Reportes y extras:** ingresos por membresía separados en el resumen del día y en el reporte de ventas; plantillas de recordatorio configurables; servicios incluidos por mes (no elegido por ahora, queda previsto).

## Decisiones abiertas (con sugerencia)

1. **Pago adelantado:** que acumule días (sugerido) o que reinicie desde el pago.
2. **Descuento de membresía y descuento por categoría de cliente:** que se aplique el mayor, sin sumarlos (sugerido).
3. **Comisión del profesional:** hoy se calcula sobre el precio sin descuento, o sea que cobra completa (sugerido: dejarlo así).
4. **Sorteo de fin de año:** como la cuota es una venta al contado, sumaría cupones (sugerido: que la cuota no sume).
5. **Reservas online:** identifican al cliente solo por celular, sin clave; por eso el beneficio se aplica **al cobrar en caja**, nunca al reservar.
6. **Factura legal de la cuota:** funciona como cualquier venta, con el IVA del servicio.

## Cómo se probaría al implementarlo

- Migración primero en local y después en producción, antes de subir el código.
- Pruebas por servidor: plan, membresía, cobro de cuota, períodos (pago puntual, adelantado y tardío), anulación que devuelve el vencimiento, y rechazo de la cuota fiada.
- Estados con fechas simuladas (activa, en gracia, vencida); el descuento aplica solo en activa y en gracia, y solo a servicios.
- En pantalla: crear plan, alta de membresía, "Cobrar cuota" hasta Vender, insignia y recordatorio de WhatsApp.
- El cierre de caja y los reportes no cambian, porque la cuota es una venta común.
