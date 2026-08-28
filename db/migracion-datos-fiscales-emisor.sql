-- Migración: datos fiscales del emisor cacheados desde el conector EMPREMAS-SIFEN.
-- Son datos que van impresos en toda representación gráfica (KuDE): actividad
-- económica, número de timbrado e inicio de vigencia. El conector es la fuente
-- de verdad; EMPREMAS guarda una copia de solo lectura para poder imprimir el
-- ticket de mostrador sin pegarle al conector en cada venta y para mostrarlos
-- (legibles, no editables) en el panel admin de la empresa.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-datos-fiscales-emisor.sql

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS sifen_actividades      JSONB,
    ADD COLUMN IF NOT EXISTS sifen_timbrado_numero  TEXT,
    ADD COLUMN IF NOT EXISTS sifen_timbrado_inicio  DATE;

-- El rol de aplicación solo existe en local/staging; en Render prod la app
-- conecta como owner de la base. Se hace condicional para que la migración
-- corra igual en los dos lados.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON empresas TO empremas_app;
    END IF;
END $$;
