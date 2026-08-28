-- Migración: documentos electrónicos habilitables por empresa (plus del plan).
-- Factura siempre disponible cuando sifen_estado='produccion'. El resto son
-- add-ons que Mario habilita por cliente desde el panel admin.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-documentos-electronicos.sql

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS sifen_remision     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sifen_nc_nd        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sifen_autofactura  BOOLEAN NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON empresas TO empremas_app;
