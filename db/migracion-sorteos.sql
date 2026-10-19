-- Sorteo de fin de ano con cupones: 1 cupon por cada X Gs de compras al
-- contado (el sobrante se acumula por cliente). Apagado por defecto, lo
-- habilita EMPREMAS por empresa desde el panel admin, NO el dueño.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS sorteos_habilitado BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sorteos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre           TEXT NOT NULL,
    monto_por_cupon  NUMERIC(14,2) NOT NULL DEFAULT 30000 CHECK (monto_por_cupon > 0),
    vigente_desde    DATE,
    vigente_hasta    DATE,
    fecha_sorteo     DATE,
    premios          TEXT,
    activo           BOOLEAN NOT NULL DEFAULT true,
    siguiente_numero INTEGER NOT NULL DEFAULT 1,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sorteos_empresa ON sorteos (empresa_id);
-- Un solo sorteo activo por empresa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sorteos_activo_unico ON sorteos (empresa_id) WHERE activo;
ALTER TABLE sorteos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteos FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY sorteos_aislamiento ON sorteos
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un cupon = una fila = un papel impreso. Nombre y celular se copian para que
-- el papel no cambie si despues se edita el cliente.
CREATE TABLE IF NOT EXISTS sorteo_cupones (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sorteo_id        UUID NOT NULL REFERENCES sorteos(id),
    numero           INTEGER NOT NULL,
    venta_id         UUID NOT NULL REFERENCES ventas(id),
    cliente_id       UUID NOT NULL REFERENCES clientes(id),
    cliente_nombre   TEXT NOT NULL,
    cliente_celular  TEXT,
    anulado          BOOLEAN NOT NULL DEFAULT false,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sorteo_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_sorteo_cupones_empresa ON sorteo_cupones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_sorteo_cupones_venta ON sorteo_cupones (venta_id);
CREATE INDEX IF NOT EXISTS idx_sorteo_cupones_cliente ON sorteo_cupones (sorteo_id, cliente_id);
ALTER TABLE sorteo_cupones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteo_cupones FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY sorteo_cupones_aislamiento ON sorteo_cupones
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Acumulador del sobrante por cliente y sorteo.
CREATE TABLE IF NOT EXISTS sorteo_clientes (
    empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sorteo_id        UUID NOT NULL REFERENCES sorteos(id),
    cliente_id       UUID NOT NULL REFERENCES clientes(id),
    monto_pendiente  NUMERIC(14,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (sorteo_id, cliente_id)
);
CREATE INDEX IF NOT EXISTS idx_sorteo_clientes_empresa ON sorteo_clientes (empresa_id);
ALTER TABLE sorteo_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteo_clientes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY sorteo_clientes_aislamiento ON sorteo_clientes
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Marca las ventas que aportaron al acumulador del sorteo (aunque no hayan
-- dado ningun cupon todavia), para poder devolver el sobrante al anularlas.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS sorteo_id UUID REFERENCES sorteos(id);
