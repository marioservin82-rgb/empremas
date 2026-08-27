-- Migración: soporte del conector propio EMPREMAS-SIFEN en el alta de clientes.
-- El alta fiscal (certificado, CSC, timbrado, actividades, ambiente) la opera
-- Mario desde el panel admin; el conector guarda esos datos, EMPREMAS sólo
-- referencia el tenant creado y su estado.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-sifen-conector.sql

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS sifen_conector_tenant_id  INTEGER,
    ADD COLUMN IF NOT EXISTS sifen_estado              TEXT NOT NULL DEFAULT 'sin_configurar',
    ADD COLUMN IF NOT EXISTS sifen_ambiente            TEXT;

-- sin_configurar -> homologacion -> homologada -> produccion
ALTER TABLE empresas DROP CONSTRAINT IF EXISTS empresas_sifen_estado_chk;
ALTER TABLE empresas ADD CONSTRAINT empresas_sifen_estado_chk
    CHECK (sifen_estado IN ('sin_configurar', 'homologacion', 'homologada', 'produccion'));

ALTER TABLE empresas DROP CONSTRAINT IF EXISTS empresas_sifen_ambiente_chk;
ALTER TABLE empresas ADD CONSTRAINT empresas_sifen_ambiente_chk
    CHECK (sifen_ambiente IS NULL OR sifen_ambiente IN ('test', 'prod'));

-- El rol de la app (empremas_app) necesita poder leer/escribir estas columnas;
-- ALTER sobre una tabla ya GRANTeada no cambia los privilegios, pero se deja el
-- GRANT explícito por si la tabla se recreara.
GRANT SELECT, INSERT, UPDATE, DELETE ON empresas TO empremas_app;
