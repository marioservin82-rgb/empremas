-- Migración: Nota de Remisión — flota (vehículos, choferes, transportistas) +
-- datos de transporte completos según SIFEN.
--
-- Reemplaza el "preset único" de transporte por listas reutilizables:
--   - la empresa guarda varios vehículos y choferes propios
--   - guarda transportistas externos (fleteros)
--   - en cada remisión se elige el modo (transporte propio / fletero /
--     el cliente lo retira con su vehículo) y se elige o se carga en el
--     momento el vehículo, el chofer y el transportista; lo cargado nuevo
--     queda guardado para la próxima
--   - se informan lugar de salida y de entrega (con ciudad) y las fechas
--     de inicio y fin estimado del traslado
--
-- Aplicar como superusuario / dueño de la base:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migracion-remision-flota.sql

BEGIN;

CREATE TABLE IF NOT EXISTS remision_vehiculos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo           TEXT NOT NULL,                 -- "CAMION", "CAMIONETA", "MOTO" (SIFEN: 4-10)
    marca          TEXT NOT NULL,                 -- 1-10
    chapa          TEXT NOT NULL,                 -- patente / nº de identificación
    predeterminado BOOLEAN NOT NULL DEFAULT false,
    activo         BOOLEAN NOT NULL DEFAULT true,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_remision_vehiculos_chapa
    ON remision_vehiculos (empresa_id, upper(chapa));

CREATE TABLE IF NOT EXISTS remision_choferes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre           TEXT NOT NULL,               -- 4-60
    documento_numero TEXT NOT NULL,               -- cédula, 1-20, sin puntos
    direccion        TEXT NOT NULL,               -- 4-60
    predeterminado   BOOLEAN NOT NULL DEFAULT false,
    activo           BOOLEAN NOT NULL DEFAULT true,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_remision_choferes_doc
    ON remision_choferes (empresa_id, documento_numero);

CREATE TABLE IF NOT EXISTS remision_transportistas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    contribuyente    BOOLEAN NOT NULL DEFAULT false,
    nombre           TEXT NOT NULL,
    ruc              TEXT,                         -- si contribuyente ("80012345-6")
    documento_tipo   SMALLINT NOT NULL DEFAULT 1,  -- si NO contribuyente
    documento_numero TEXT,                         -- si NO contribuyente
    direccion        TEXT NOT NULL,
    activo           BOOLEAN NOT NULL DEFAULT true,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_remision_transportistas_empresa
    ON remision_transportistas (empresa_id);

CREATE INDEX IF NOT EXISTS idx_remision_vehiculos_empresa ON remision_vehiculos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_remision_choferes_empresa  ON remision_choferes (empresa_id);

-- Columnas nuevas en remisiones. `transporte` (JSONB) sigue siendo la foto
-- congelada que se le manda al conector; estas columnas son para la pantalla
-- y la trazabilidad.
ALTER TABLE remisiones
    ADD COLUMN IF NOT EXISTS modo_transporte       TEXT NOT NULL DEFAULT 'propio',   -- propio | fletero | cliente_retira
    ADD COLUMN IF NOT EXISTS tipo_transporte       SMALLINT NOT NULL DEFAULT 1,      -- 1 propio, 2 tercero (SIFEN iTipTrans)
    ADD COLUMN IF NOT EXISTS responsable_flete     SMALLINT NOT NULL DEFAULT 5,      -- SIFEN iRespFlete
    ADD COLUMN IF NOT EXISTS direccion_salida      TEXT,
    ADD COLUMN IF NOT EXISTS ciudad_salida         INTEGER,
    ADD COLUMN IF NOT EXISTS fecha_fin_traslado    DATE,
    ADD COLUMN IF NOT EXISTS vehiculo_id           UUID REFERENCES remision_vehiculos(id),
    ADD COLUMN IF NOT EXISTS chofer_id             UUID REFERENCES remision_choferes(id),
    ADD COLUMN IF NOT EXISTS transportista_id      UUID REFERENCES remision_transportistas(id);

ALTER TABLE remision_vehiculos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE remision_vehiculos       FORCE  ROW LEVEL SECURITY;
ALTER TABLE remision_choferes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE remision_choferes        FORCE  ROW LEVEL SECURITY;
ALTER TABLE remision_transportistas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE remision_transportistas  FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'remision_vehiculos') THEN
        CREATE POLICY remision_vehiculos_aislamiento ON remision_vehiculos
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'remision_choferes') THEN
        CREATE POLICY remision_choferes_aislamiento ON remision_choferes
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'remision_transportistas') THEN
        CREATE POLICY remision_transportistas_aislamiento ON remision_transportistas
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON remision_vehiculos      TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON remision_choferes       TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON remision_transportistas TO empremas_app;
    END IF;
END $$;

COMMIT;
