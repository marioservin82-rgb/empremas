-- Migración: Nota de Crédito / Débito electrónica (SIFEN iTiDE 5 y 6).
--
-- Siempre ajustan una factura ya emitida y aprobada (documento asociado
-- obligatorio en SIFEN). Alcance parcial (algunos ítems/cantidades) o total.
--   - NC por motivo Devolución (1 o 2): el stock vuelve a entrar.
--   - Otros motivos (descuento, bonificación, ajuste de precio): no tocan stock.
--   - NC total sobre una factura a crédito: revierte el saldo del cliente y
--     marca la venta como anulada (la NC es la anulación fiscal).
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-notas-credito-debito.sql

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_nota_electronica') THEN
        CREATE TYPE tipo_nota_electronica AS ENUM ('credito', 'debito');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_nota_electronica') THEN
        CREATE TYPE estado_nota_electronica AS ENUM
            ('pendiente', 'enviado', 'aprobado', 'rechazado', 'error');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS notas_electronicas (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id         UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sucursal_id        UUID REFERENCES sucursales(id),
    usuario_id         UUID NOT NULL REFERENCES usuarios(id),
    tipo               tipo_nota_electronica NOT NULL,
    venta_id           UUID NOT NULL REFERENCES ventas(id),
    factura_cdc        TEXT NOT NULL,
    motivo             SMALLINT NOT NULL,          -- notasCreditosMotivos 1..8
    observacion        TEXT,
    total              NUMERIC(14,2) NOT NULL,
    es_total           BOOLEAN NOT NULL DEFAULT false,
    reingresa_stock    BOOLEAN NOT NULL DEFAULT false,
    estado             estado_nota_electronica NOT NULL DEFAULT 'pendiente',
    cdc                TEXT,
    numero_formateado  TEXT,
    mensaje_error      TEXT,
    gravado_5          NUMERIC(14,2),
    gravado_10         NUMERIC(14,2),
    exentas            NUMERIC(14,2),
    iva_5              NUMERIC(14,2),
    iva_10             NUMERIC(14,2),
    total_iva          NUMERIC(14,2),
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nota_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nota_id         UUID NOT NULL REFERENCES notas_electronicas(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES productos(id),
    cantidad        NUMERIC(14,3) NOT NULL,
    precio_unitario NUMERIC(14,2) NOT NULL,
    tasa_iva        SMALLINT NOT NULL,
    subtotal        NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notas_electronicas_empresa ON notas_electronicas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_electronicas_venta ON notas_electronicas (venta_id);
CREATE INDEX IF NOT EXISTS idx_nota_items_empresa ON nota_items (empresa_id);
CREATE INDEX IF NOT EXISTS idx_nota_items_nota ON nota_items (nota_id);

ALTER TABLE notas_electronicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_electronicas FORCE ROW LEVEL SECURITY;
ALTER TABLE nota_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nota_items FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notas_electronicas') THEN
        CREATE POLICY notas_electronicas_aislamiento ON notas_electronicas
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nota_items') THEN
        CREATE POLICY nota_items_aislamiento ON nota_items
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON notas_electronicas TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON nota_items TO empremas_app;
    END IF;
END $$;
