-- Migración: datos de pago de EMPREMAS para el cobro de la mensualidad.
--
-- Texto libre (banco, cuenta, titular, billeteras...) que el admin carga en
-- Configuración de soporte y que se usa en el mensaje de WhatsApp que se le
-- manda a una empresa cuando su plan está por vencer.
--
-- Aplicar como superusuario / dueño de la base:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migracion-datos-pago-plataforma.sql

ALTER TABLE configuracion_plataforma
    ADD COLUMN IF NOT EXISTS datos_pago TEXT;
