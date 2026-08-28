-- Migración: reproceso de factura rechazada sobre el MISMO número + log de intentos.
--
-- Corrige el modelo anterior (intento + vigente, multi-fila por venta): un
-- reproceso mantiene el número original de la factura, y cada intento de emisión
-- queda registrado en documento_electronico_intentos.
-- También agrega el desglose de IVA (para el ticket) sobre documentos_electronicos.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-de-intentos-log.sql

BEGIN;

-- El backfill lo corre soporte (owner de la base), no la app. En prod el owner
-- NO es superusuario, así que FORCE ROW LEVEL SECURITY también lo alcanza y
-- filtraría los INSERT/DELETE. Se desactiva FORCE mientras dura la migración y
-- se restaura al final. En local (superusuario) esto es inocuo.
ALTER TABLE documentos_electronicos NO FORCE ROW LEVEL SECURITY;

-- 1. Tabla de log: un intento de emisión por fila.
CREATE TABLE IF NOT EXISTS documento_electronico_intentos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    documento_id   UUID NOT NULL REFERENCES documentos_electronicos(id) ON DELETE CASCADE,
    intento        SMALLINT NOT NULL,
    estado         estado_documento_electronico NOT NULL,
    cdc            TEXT,
    codigo         TEXT,
    mensaje        TEXT,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (documento_id, intento)
);
CREATE INDEX IF NOT EXISTS idx_de_intentos_empresa ON documento_electronico_intentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_de_intentos_doc ON documento_electronico_intentos (documento_id);
ALTER TABLE documento_electronico_intentos ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'documento_electronico_intentos') THEN
        CREATE POLICY de_intentos_aislamiento ON documento_electronico_intentos
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
END $$;

-- 2. Desglose de IVA en documentos_electronicos (para el ticket / KuDE propio).
ALTER TABLE documentos_electronicos
    ADD COLUMN IF NOT EXISTS gravado_5   NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS gravado_10  NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS exentas     NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS iva_5       NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS iva_10      NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS total_iva   NUMERIC(14,2);

-- 3. Backfill del log: cada documento_electronico actual = un intento.
INSERT INTO documento_electronico_intentos (empresa_id, documento_id, intento, estado, cdc, mensaje, creado_en, actualizado_en)
SELECT empresa_id, id, COALESCE(intento, 1), estado, cdc, mensaje_error, creado_en, actualizado_en
FROM documentos_electronicos d
WHERE NOT EXISTS (SELECT 1 FROM documento_electronico_intentos i WHERE i.documento_id = d.id AND i.intento = COALESCE(d.intento, 1));

-- 4. Consolidar ventas con varios documentos: se conserva el intento más antiguo
--    (su número es la identidad de la factura); los demás pasan al log y se borran.
INSERT INTO documento_electronico_intentos (empresa_id, documento_id, intento, estado, cdc, mensaje, creado_en, actualizado_en)
SELECT r.empresa_id, r.keep_id, r.rn, r.estado, r.cdc, r.mensaje_error, r.creado_en, r.actualizado_en
FROM (
    SELECT id, empresa_id, estado, cdc, mensaje_error, creado_en, actualizado_en,
           row_number()  OVER w AS rn,
           first_value(id) OVER w AS keep_id
    FROM documentos_electronicos
    WINDOW w AS (PARTITION BY venta_id ORDER BY COALESCE(intento, 1), creado_en)
) r
WHERE r.rn > 1
ON CONFLICT (documento_id, intento) DO NOTHING;

DELETE FROM documentos_electronicos d
WHERE EXISTS (
    SELECT 1 FROM documentos_electronicos d2
    WHERE d2.venta_id = d.venta_id
      AND (COALESCE(d2.intento, 1), d2.creado_en) < (COALESCE(d.intento, 1), d.creado_en)
);

-- 5. Volver a "un documento por venta".
DROP INDEX IF EXISTS uq_documentos_electronicos_venta_vigente;
ALTER TABLE documentos_electronicos DROP COLUMN IF EXISTS vigente;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentos_electronicos_venta_id_key') THEN
        ALTER TABLE documentos_electronicos ADD CONSTRAINT documentos_electronicos_venta_id_key UNIQUE (venta_id);
    END IF;
END $$;

-- 6. `intento` en la fila principal = número del último intento registrado.
UPDATE documentos_electronicos d
SET intento = COALESCE((SELECT max(intento) FROM documento_electronico_intentos i WHERE i.documento_id = d.id), 1);

-- Restaurar el aislamiento por empresa.
ALTER TABLE documentos_electronicos FORCE ROW LEVEL SECURITY;
ALTER TABLE documento_electronico_intentos FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON documentos_electronicos TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON documento_electronico_intentos TO empremas_app;
    END IF;
END $$;

COMMIT;
