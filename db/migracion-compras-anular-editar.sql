-- Migración: anular / editar una compra ya registrada.
--   - sucursal_id: en qué sucursal entró el stock (para poder revertirlo al
--     anular). Se backfillea con la sucursal del usuario que la cargó.
--   - anulada + metadatos de anulación (mismo patrón que ventas.anulada).
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-compras-anular-editar.sql

ALTER TABLE compras
    ADD COLUMN IF NOT EXISTS sucursal_id       UUID REFERENCES sucursales(id),
    ADD COLUMN IF NOT EXISTS anulada           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS anulada_en        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS anulada_por       UUID REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS motivo_anulacion  TEXT;

UPDATE compras c
   SET sucursal_id = u.sucursal_id
  FROM usuarios u
 WHERE u.id = c.usuario_id AND c.sucursal_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON compras TO empremas_app;
    END IF;
END $$;
