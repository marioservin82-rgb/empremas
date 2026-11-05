-- Cuentas bancarias / billeteras de la empresa: en una transferencia se
-- registra a que cuenta entro el cobro o de cual salio el pago, mas un
-- numero de operacion opcional. Solo para forma_pago = 'transferencia'.
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    banco           TEXT,
    tipo            TEXT NOT NULL DEFAULT 'cuenta_corriente'
                    CHECK (tipo IN ('cuenta_corriente', 'caja_ahorro', 'billetera')),
    numero_cuenta   TEXT,
    titular         TEXT,
    es_principal    BOOLEAN NOT NULL DEFAULT false,
    activa          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_empresa ON cuentas_bancarias (empresa_id);
-- Una sola cuenta principal por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cuentas_bancarias_principal ON cuentas_bancarias (empresa_id) WHERE es_principal;
ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_bancarias FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cuentas_bancarias_aislamiento ON cuentas_bancarias
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cuenta y numero de operacion en cada tabla que guarda pagos. NULL = efectivo,
-- tarjeta, empresa sin cuentas cargadas, o un movimiento anterior a este cambio.
ALTER TABLE venta_pagos      ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id);
ALTER TABLE venta_pagos      ADD COLUMN IF NOT EXISTS nro_operacion TEXT;
ALTER TABLE cobro_pagos      ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id);
ALTER TABLE cobro_pagos      ADD COLUMN IF NOT EXISTS nro_operacion TEXT;
ALTER TABLE compra_pagos     ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id);
ALTER TABLE compra_pagos     ADD COLUMN IF NOT EXISTS nro_operacion TEXT;
ALTER TABLE pagos_proveedor  ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id);
ALTER TABLE pagos_proveedor  ADD COLUMN IF NOT EXISTS nro_operacion TEXT;
ALTER TABLE anticipos        ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id);
ALTER TABLE anticipos        ADD COLUMN IF NOT EXISTS nro_operacion TEXT;
ALTER TABLE gastos           ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES cuentas_bancarias(id);
ALTER TABLE gastos           ADD COLUMN IF NOT EXISTS nro_operacion TEXT;
