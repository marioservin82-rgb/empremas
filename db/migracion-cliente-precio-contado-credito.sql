-- Cliente al que se le factura a credito con el precio de contado (ej.
-- instituciones publicas, que no aceptan que el precio suba por ser a credito).
-- Solo marca el valor por defecto de la casilla en Vender. Idempotente.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS precio_contado_en_credito BOOLEAN NOT NULL DEFAULT false;
