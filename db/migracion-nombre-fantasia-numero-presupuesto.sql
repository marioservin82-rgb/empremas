-- Migración: nombre de fantasía del emisor + numeración de presupuestos.
--
--  1. empresas.nombre_fantasia — se muestra (junto a la razón social) en el
--     ticket interno, el recibo de cobro, los extractos y el presupuesto.
--     Para empresas con facturación electrónica lo pisa el conector
--     (sincronizarDatosFiscales); las demás lo editan en Perfil de Empresa.
--  2. presupuestos.numero + empresas.siguiente_numero_presupuesto — cada
--     presupuesto pasa a tener un número correlativo por empresa, igual que
--     los recibos de cobro y los tickets de venta.
--
-- Aplicar como superusuario / dueño de la base:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migracion-nombre-fantasia-numero-presupuesto.sql

BEGIN;

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS nombre_fantasia              TEXT,
    ADD COLUMN IF NOT EXISTS siguiente_numero_presupuesto INTEGER NOT NULL DEFAULT 1;

ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS numero INTEGER;

-- Backfill: el dueño de la base está sujeto a FORCE RLS sin app.empresa_actual.
ALTER TABLE presupuestos NO FORCE ROW LEVEL SECURITY;

WITH numerados AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY creado_en, id) AS n
    FROM presupuestos
)
UPDATE presupuestos p
   SET numero = numerados.n
  FROM numerados
 WHERE numerados.id = p.id
   AND p.numero IS NULL;

UPDATE empresas e
   SET siguiente_numero_presupuesto = GREATEST(
       e.siguiente_numero_presupuesto,
       COALESCE((SELECT MAX(numero) + 1 FROM presupuestos WHERE empresa_id = e.id), 1));

ALTER TABLE presupuestos FORCE ROW LEVEL SECURITY;

COMMIT;
