-- Anticipos de clientes: plata que un cliente deja ANTES de que exista
-- una venta final (deja a su mascota internada, deja un equipo a
-- reparar, o encarga algo por Presupuesto). Se suma a caja el mismo día
-- que se recibe (turno propio, igual que un cobro), y más adelante se
-- convierte en una línea de pago más dentro de la venta que finalmente
-- se genera (ver ventasController.js).
DO $$ BEGIN
    CREATE TYPE estado_anticipo AS ENUM ('disponible', 'aplicado', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS anticipos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id        UUID NOT NULL REFERENCES clientes(id),
    -- Exactamente uno de estos tres - de qué pedido es este anticipo.
    presupuesto_id    UUID REFERENCES presupuestos(id),
    internacion_id    UUID REFERENCES internaciones(id),
    reparacion_id     UUID REFERENCES reparaciones(id),
    monto             NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    forma_pago        forma_pago_venta NOT NULL,
    estado            estado_anticipo NOT NULL DEFAULT 'disponible',
    turno_id          UUID REFERENCES turnos(id),
    usuario_id        UUID NOT NULL REFERENCES usuarios(id),
    nota              TEXT,
    anulado_en        TIMESTAMPTZ,
    anulado_por       UUID REFERENCES usuarios(id),
    motivo_anulacion  TEXT,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT anticipo_un_solo_origen CHECK (
        (presupuesto_id IS NOT NULL)::int + (internacion_id IS NOT NULL)::int + (reparacion_id IS NOT NULL)::int = 1
    )
);
CREATE INDEX IF NOT EXISTS idx_anticipos_empresa ON anticipos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_anticipos_presupuesto ON anticipos (presupuesto_id) WHERE presupuesto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anticipos_internacion ON anticipos (internacion_id) WHERE internacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anticipos_reparacion ON anticipos (reparacion_id) WHERE reparacion_id IS NOT NULL;

ALTER TABLE anticipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE anticipos FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY anticipos_aislamiento ON anticipos
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Marca qué línea de venta_pagos vino de aplicar un anticipo - necesario
-- para NO volver a sumarla en caja (esa plata ya se contó el día que se
-- recibió el anticipo, en su propio turno).
ALTER TABLE venta_pagos ADD COLUMN IF NOT EXISTS origen_anticipo_id UUID REFERENCES anticipos(id);
