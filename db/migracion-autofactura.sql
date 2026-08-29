-- Migración: Autofactura electrónica (SIFEN iTiDE 4).
--
-- La emite un contribuyente (nuestra empresa) para documentar una COMPRA a un
-- no contribuyente o a un extranjero — típicamente un productor rural sin RUC.
--   - El "vendedor" NO es contribuyente: se guardan sus datos + su Constancia
--     de No Ser Contribuyente (o de microproductores).
--   - Los ítems NO informan IVA (Manual Técnico, error 1901).
--   - El receptor del DE es la propia empresa emisora.
--   - v1: es un documento puramente fiscal, NO mueve stock (para eso está
--     "Registrar compra"). Los ítems son de texto libre.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-autofactura.sql

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_autofactura') THEN
        CREATE TYPE estado_autofactura AS ENUM
            ('pendiente', 'enviado', 'aprobado', 'rechazado', 'error');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS autofacturas (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id             UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sucursal_id            UUID REFERENCES sucursales(id),
    usuario_id             UUID NOT NULL REFERENCES usuarios(id),
    proveedor_id           UUID REFERENCES proveedores(id),   -- opcional, sólo referencia

    -- Vendedor (no contribuyente / extranjero)
    vendedor_naturaleza    SMALLINT NOT NULL DEFAULT 1,        -- 1 = No contribuyente, 2 = Extranjero
    vendedor_doc_tipo      SMALLINT NOT NULL DEFAULT 1,        -- tiposDocumentosIdentidades (1 = Cédula)
    vendedor_doc_numero    TEXT NOT NULL,
    vendedor_nombre        TEXT NOT NULL,
    vendedor_direccion     TEXT NOT NULL,
    vendedor_numero_casa   TEXT NOT NULL DEFAULT '0',
    vendedor_ciudad        INTEGER NOT NULL,                   -- código de ciudad SIFEN

    -- Lugar donde se realizó la transacción
    transaccion_direccion  TEXT NOT NULL,
    transaccion_ciudad     INTEGER NOT NULL,

    -- Constancia de no ser contribuyente / de microproductores
    constancia_tipo        SMALLINT NOT NULL DEFAULT 1,        -- 1 = no contribuyente, 2 = microproductores
    constancia_numero      TEXT NOT NULL,                      -- 11 dígitos
    constancia_control     TEXT NOT NULL,                      -- 8 caracteres

    tipo_transaccion       SMALLINT NOT NULL DEFAULT 10,       -- 10 = compra de productos, 11 = de servicios
    observacion            TEXT,
    total                  NUMERIC(14,2) NOT NULL,

    estado                 estado_autofactura NOT NULL DEFAULT 'pendiente',
    cdc                    TEXT,
    numero_formateado      TEXT,
    mensaje_error          TEXT,
    creado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS autofactura_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    autofactura_id  UUID NOT NULL REFERENCES autofacturas(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        NUMERIC(14,3) NOT NULL,
    precio_unitario NUMERIC(14,2) NOT NULL,
    subtotal        NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autofacturas_empresa ON autofacturas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_autofactura_items_empresa ON autofactura_items (empresa_id);
CREATE INDEX IF NOT EXISTS idx_autofactura_items_af ON autofactura_items (autofactura_id);

ALTER TABLE autofacturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE autofacturas FORCE ROW LEVEL SECURITY;
ALTER TABLE autofactura_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE autofactura_items FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'autofacturas') THEN
        CREATE POLICY autofacturas_aislamiento ON autofacturas
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'autofactura_items') THEN
        CREATE POLICY autofactura_items_aislamiento ON autofactura_items
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON autofacturas TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON autofactura_items TO empremas_app;
    END IF;
END $$;
