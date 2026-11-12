-- Membresias (salones/barberias): el cliente paga una cuota mensual y, mientras
-- este al dia, tiene beneficios. La cuota se cobra como una venta normal de un
-- servicio "Cuota Membresia X"; cada pago queda registrado con su periodo y el
-- estado se calcula desde el ultimo periodo pagado. Apagado por defecto, lo
-- habilita EMPREMAS por empresa desde el panel admin, NO el dueño.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS membresias_habilitadas BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS membresia_planes (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id               UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre                   TEXT NOT NULL,
    descripcion              TEXT,
    precio_mensual           NUMERIC(14,2) NOT NULL CHECK (precio_mensual > 0),
    descuento_servicios_pct  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_servicios_pct >= 0 AND descuento_servicios_pct <= 100),
    dias_gracia              INTEGER NOT NULL DEFAULT 5 CHECK (dias_gracia >= 0),
    -- Servicio que se vende para cobrar la cuota (se crea solo con el plan).
    producto_id              UUID NOT NULL REFERENCES productos(id),
    activo                   BOOLEAN NOT NULL DEFAULT true,
    creado_en                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_membresia_planes_empresa ON membresia_planes (empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membresia_planes_producto ON membresia_planes (producto_id);
ALTER TABLE membresia_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresia_planes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY membresia_planes_aislamiento ON membresia_planes
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS membresias (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id  UUID NOT NULL REFERENCES clientes(id),
    plan_id     UUID NOT NULL REFERENCES membresia_planes(id),
    alta_en     DATE NOT NULL DEFAULT CURRENT_DATE,
    cancelada   BOOLEAN NOT NULL DEFAULT false,
    notas       TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_membresias_empresa ON membresias (empresa_id);
CREATE INDEX IF NOT EXISTS idx_membresias_cliente ON membresias (cliente_id);
-- Un cliente tiene como maximo una membresia vigente (no cancelada).
CREATE UNIQUE INDEX IF NOT EXISTS idx_membresias_cliente_vigente ON membresias (cliente_id) WHERE NOT cancelada;
ALTER TABLE membresias ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresias FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY membresias_aislamiento ON membresias
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cada cuota cobrada y el periodo que cubre. periodo_hasta es el vencimiento.
-- Fuente de verdad del estado: si se anula la venta, el pago se marca anulado
-- y el vencimiento vuelve solo al periodo anterior.
CREATE TABLE IF NOT EXISTS membresia_pagos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    membresia_id   UUID NOT NULL REFERENCES membresias(id),
    venta_id       UUID NOT NULL REFERENCES ventas(id),
    periodo_desde  DATE NOT NULL,
    periodo_hasta  DATE NOT NULL,
    monto          NUMERIC(14,2) NOT NULL,
    anulado        BOOLEAN NOT NULL DEFAULT false,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (venta_id)
);
CREATE INDEX IF NOT EXISTS idx_membresia_pagos_empresa ON membresia_pagos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_membresia_pagos_membresia ON membresia_pagos (membresia_id);
ALTER TABLE membresia_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresia_pagos FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY membresia_pagos_aislamiento ON membresia_pagos
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
