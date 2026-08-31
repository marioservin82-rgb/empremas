-- Migración: cancelación de una Factura Legal en SIFEN.
--
-- Cuando se anula una venta con Factura Legal aprobada, además de revertir
-- stock/saldo en EMPREMAS hay que comunicarlo a SIFEN con el evento de
-- cancelación (dentro de las 48h de emitida). Estas columnas guardan el
-- resultado de ese evento.
--
-- Aplicar como superusuario / dueño de la base:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migracion-cancelacion-sifen.sql

ALTER TABLE documentos_electronicos
    ADD COLUMN IF NOT EXISTS cancelado_en_sifen  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancelacion_mensaje TEXT,
    ADD COLUMN IF NOT EXISTS cancelacion_en      TIMESTAMPTZ;
