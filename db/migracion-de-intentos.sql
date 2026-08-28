-- Migración: historial de intentos de emisión por venta.
-- Antes había UN documento_electronico por venta (UNIQUE venta_id) y el
-- reintento de una factura rechazada pisaba el registro. Ahora cada intento
-- queda como su propia fila: la rechazada conserva su número muerto en el
-- historial y el reintento crea un intento nuevo, marcado `vigente`.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-de-intentos.sql

ALTER TABLE documentos_electronicos
    ADD COLUMN IF NOT EXISTS intento  SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS vigente  BOOLEAN  NOT NULL DEFAULT true;

-- Se reemplaza el UNIQUE(venta_id) por "un único intento vigente por venta".
ALTER TABLE documentos_electronicos DROP CONSTRAINT IF EXISTS documentos_electronicos_venta_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_electronicos_venta_vigente
    ON documentos_electronicos (venta_id) WHERE vigente;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON documentos_electronicos TO empremas_app;
    END IF;
END $$;
