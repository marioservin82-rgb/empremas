-- Migración: al pagar una compra en efectivo, distinguir si la plata sale de
-- la CAJA (registro) o de ADMINISTRACIÓN (fondos del dueño). Si sale de caja se
-- genera automáticamente un retiro de caja (motivo pago_proveedor), así se
-- refleja solo en la reconciliación del turno sin tener que cargarlo aparte.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-compra-pago-origen.sql

ALTER TABLE compra_pagos
    ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'administracion'
        CHECK (origen IN ('administracion', 'caja'));

-- Traza el retiro de caja autogenerado -> su compra (para revertirlo si se anula).
ALTER TABLE retiros_caja
    ADD COLUMN IF NOT EXISTS compra_id UUID REFERENCES compras(id);
CREATE INDEX IF NOT EXISTS idx_retiros_caja_compra ON retiros_caja (compra_id) WHERE compra_id IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON compra_pagos TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON retiros_caja TO empremas_app;
    END IF;
END $$;
