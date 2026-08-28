-- Migración: vencimiento del timbrado y vigencia del certificado de firma,
-- cacheados desde el conector EMPREMAS-SIFEN (fuente de verdad).
--   - sifen_timbrado_fin: opcional (los timbrados electrónicos suelen ser
--     indefinidos); lo carga soporte en el panel admin si el timbrado tiene
--     fecha de fin.
--   - sifen_cert_desde / sifen_cert_vence: se extraen del propio .pfx en el
--     conector, no se cargan a mano. Cuando el certificado vence, la
--     facturación se corta: sirve para avisar con tiempo.
--
-- (sifen_cert_vencimiento, ya existente, era un registro manual del dueño para
--  el camino Sifende — se mantiene como fallback.)
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-vigencias-fiscales.sql

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS sifen_timbrado_fin  DATE,
    ADD COLUMN IF NOT EXISTS sifen_cert_desde    DATE,
    ADD COLUMN IF NOT EXISTS sifen_cert_vence    DATE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON empresas TO empremas_app;
    END IF;
END $$;
