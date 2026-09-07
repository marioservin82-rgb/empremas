-- Descuento manual por linea de venta (ej. "regalo" de cumpleanos en un
-- salon de belleza: la cita ocupa el horario pero no entra efectivo en
-- caja por ese servicio) - ver crearVenta en ventasController.js.

ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS descuento_monto NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS descuento_motivo TEXT;

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_autorizado_por UUID REFERENCES usuarios(id);

-- Nuevo permiso extra: un cajero con este permiso puede aplicar descuentos
-- sin pedir PIN de un dueno/encargado (mismo criterio que anular_sin_pin).
-- Sentencia propia, sin DO-wrap: ALTER TYPE ... ADD VALUE no corre dentro
-- de un bloque PL/pgSQL. "IF NOT EXISTS" (soportado desde PG12) la hace
-- idempotente sin necesitar ese wrap.
ALTER TYPE permiso_extra ADD VALUE IF NOT EXISTS 'aplicar_descuentos';
