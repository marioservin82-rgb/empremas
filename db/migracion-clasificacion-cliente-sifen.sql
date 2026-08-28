-- Migración: clasificación SIFEN del cliente (tipo de operación / iTiOpe).
--   auto = B2B si el cliente es contribuyente (RUC en el padrón), B2C si no.
--   b2b  = fuerza B2B (venta a contribuyente)
--   b2c  = fuerza B2C (consumidor final)
--   b2g  = B2G (sector público)
--   b2f  = B2F (exterior / exportación)
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-clasificacion-cliente-sifen.sql

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS clasificacion_sifen TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_clasificacion_sifen_chk;
ALTER TABLE clientes ADD CONSTRAINT clientes_clasificacion_sifen_chk
    CHECK (clasificacion_sifen IN ('auto', 'b2b', 'b2c', 'b2g', 'b2f'));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON clientes TO empremas_app;
    END IF;
END $$;
