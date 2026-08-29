-- Migración: Nota de Remisión electrónica (SIFEN iTiDE 7).
--
-- Dos flujos:
--   1. Desde una factura ya emitida -> se genera la remisión con su CDC. La
--      factura ya descontó el stock, la remisión no lo toca.
--   2. Remisión primero, factura después -> la mercadería sale del depósito
--      al emitir la remisión, así que ahí se descuenta el stock. La factura
--      posterior (crearVenta con remisionId) ya no lo vuelve a descontar.
--
-- El vehículo / chofer / transportista salen del preset de la empresa
-- (empresas.preset_remision), editables por remisión.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-remisiones.sql

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_remision') THEN
        CREATE TYPE estado_remision AS ENUM
            ('borrador', 'pendiente', 'enviado', 'aprobado', 'rechazado', 'error');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS remisiones (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sucursal_id           UUID REFERENCES sucursales(id),
    usuario_id            UUID NOT NULL REFERENCES usuarios(id),
    cliente_id            UUID REFERENCES clientes(id),
    -- Vínculo con la factura
    venta_id              UUID REFERENCES ventas(id),   -- factura asociada (existente o creada después)
    factura_cdc           TEXT,                          -- CDC de la factura ya emitida
    fecha_futura_factura  DATE,                          -- si se factura después
    facturada             BOOLEAN NOT NULL DEFAULT false,
    -- Motivo y traslado
    motivo                SMALLINT NOT NULL DEFAULT 1,   -- 1 = traslado por venta
    observacion           TEXT,
    direccion_entrega     TEXT NOT NULL,
    ciudad_entrega        INTEGER,                        -- código SIFEN; NULL = misma ciudad del emisor
    km_estimados          NUMERIC(10,2) NOT NULL DEFAULT 1,
    fecha_traslado        DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Transporte (copiado del preset al emitir, editable por remisión):
    -- { tipoTransporte, modalidad, responsableFlete, vehiculo:{tipo,marca,chapa},
    --   transportista:{contribuyente,nombre,ruc|documentoTipo+documentoNumero,direccion,
    --                  chofer:{nombre,documentoNumero,direccion}} }
    transporte            JSONB NOT NULL,
    -- Estado ante SIFEN
    estado                estado_remision NOT NULL DEFAULT 'pendiente',
    cdc                   TEXT,
    numero_formateado     TEXT,
    mensaje_error         TEXT,
    -- Si al emitir se descontó stock (flujo "factura después"), para poder revertirlo.
    descuenta_stock       BOOLEAN NOT NULL DEFAULT false,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remision_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    remision_id   UUID NOT NULL REFERENCES remisiones(id) ON DELETE CASCADE,
    producto_id   UUID NOT NULL REFERENCES productos(id),
    cantidad      NUMERIC(14,3) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_remisiones_empresa ON remisiones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_remisiones_venta ON remisiones (venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_remision_items_empresa ON remision_items (empresa_id);
CREATE INDEX IF NOT EXISTS idx_remision_items_remision ON remision_items (remision_id);

ALTER TABLE remisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE remisiones FORCE ROW LEVEL SECURITY;
ALTER TABLE remision_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE remision_items FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'remisiones') THEN
        CREATE POLICY remisiones_aislamiento ON remisiones
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'remision_items') THEN
        CREATE POLICY remision_items_aislamiento ON remision_items
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
END $$;

-- Preset de transporte de la empresa (mismo shape que remisiones.transporte).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS preset_remision JSONB;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON remisiones TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON remision_items TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON empresas TO empremas_app;
    END IF;
END $$;
