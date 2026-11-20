-- Servicio con precio y costo libres (ej. flete / envio): su precio y su costo
-- cambian en cada venta (distancia, tipo de camion), asi que se cargan al
-- vender en vez de salir del catalogo. Siempre es un servicio (no tiene stock).
-- Idempotente.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_libre BOOLEAN NOT NULL DEFAULT false;
