-- Migración: Traslados de stock entre sucursales + Pedido de sucursal a la
-- central + acceso transversal del dueño (este último no toca la base, es
-- un header por request, ver middleware/autenticar.js).
--
-- Traslado: descuenta el stock de origen al CREARLO (mismo criterio que
-- una salida real, la mercadería sale físicamente ni bien se prepara), lo
-- suma a destino recién cuando esa sucursal CONFIRMA que lo recibió.
-- Mientras está 'pendiente' ese stock no está en ningún lado contable -
-- refleja que está en camino.
--
-- Pedido de sucursal: una sucursal pide lo que necesita, la central lo ve
-- y genera un Traslado a partir de él (opcional - el Traslado sigue
-- funcionando solo, sin que medie ningún pedido). No es lo mismo que
-- "pedidos" (comandas de mesa del módulo de Lomitería) - nombre completo
-- distinto a propósito para no confundir. Queda 'atendido' recién cuando
-- el Traslado generado a partir de él se CONFIRMA, no cuando se genera.
--
-- Aplicar como superusuario:
--   PGPASSWORD=postgres psql -U postgres -h localhost -d empremas -f db/migracion-traslados-sucursales.sql

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pedido_sucursal') THEN
        CREATE TYPE estado_pedido_sucursal AS ENUM ('pendiente', 'atendido', 'cancelado');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS pedidos_sucursal (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero          INTEGER NOT NULL,
    sucursal_id     UUID NOT NULL REFERENCES sucursales(id), -- quien pide
    estado          estado_pedido_sucursal NOT NULL DEFAULT 'pendiente',
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),   -- quien lo cargó
    nota            TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atendido_en     TIMESTAMPTZ,
    UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS pedido_sucursal_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    pedido_sucursal_id  UUID NOT NULL REFERENCES pedidos_sucursal(id) ON DELETE CASCADE,
    producto_id         UUID NOT NULL REFERENCES productos(id),
    cantidad            NUMERIC(14,3) NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_traslado') THEN
        CREATE TYPE estado_traslado AS ENUM ('pendiente', 'confirmado', 'cancelado');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS traslados_stock (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero              INTEGER NOT NULL,
    sucursal_origen_id  UUID NOT NULL REFERENCES sucursales(id),
    sucursal_destino_id UUID NOT NULL REFERENCES sucursales(id),
    estado              estado_traslado NOT NULL DEFAULT 'pendiente',
    usuario_envia_id    UUID NOT NULL REFERENCES usuarios(id),
    usuario_confirma_id UUID REFERENCES usuarios(id),
    -- Si nace de un Pedido de sucursal, queda linkeado (ver comentario de
    -- arriba sobre cuándo ese pedido pasa a 'atendido').
    pedido_sucursal_id  UUID REFERENCES pedidos_sucursal(id),
    nota                TEXT,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmado_en       TIMESTAMPTZ,
    UNIQUE (empresa_id, numero),
    CHECK (sucursal_origen_id <> sucursal_destino_id)
);

CREATE TABLE IF NOT EXISTS traslado_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    traslado_id   UUID NOT NULL REFERENCES traslados_stock(id) ON DELETE CASCADE,
    producto_id   UUID NOT NULL REFERENCES productos(id),
    cantidad      NUMERIC(14,3) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_sucursal_empresa ON pedidos_sucursal (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_sucursal_pendientes ON pedidos_sucursal (empresa_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_pedido_sucursal_items_empresa ON pedido_sucursal_items (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedido_sucursal_items_pedido ON pedido_sucursal_items (pedido_sucursal_id);
CREATE INDEX IF NOT EXISTS idx_traslados_stock_empresa ON traslados_stock (empresa_id);
CREATE INDEX IF NOT EXISTS idx_traslados_stock_destino_pendiente ON traslados_stock (empresa_id, sucursal_destino_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_traslado_items_empresa ON traslado_items (empresa_id);
CREATE INDEX IF NOT EXISTS idx_traslado_items_traslado ON traslado_items (traslado_id);

ALTER TABLE pedidos_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_sucursal FORCE ROW LEVEL SECURITY;
ALTER TABLE pedido_sucursal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_sucursal_items FORCE ROW LEVEL SECURITY;
ALTER TABLE traslados_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE traslados_stock FORCE ROW LEVEL SECURITY;
ALTER TABLE traslado_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE traslado_items FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedidos_sucursal') THEN
        CREATE POLICY pedidos_sucursal_aislamiento ON pedidos_sucursal
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedido_sucursal_items') THEN
        CREATE POLICY pedido_sucursal_items_aislamiento ON pedido_sucursal_items
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'traslados_stock') THEN
        CREATE POLICY traslados_stock_aislamiento ON traslados_stock
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'traslado_items') THEN
        CREATE POLICY traslado_items_aislamiento ON traslado_items
            USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
    END IF;
END $$;

-- Numeración correlativa por empresa, mismo patrón que
-- siguiente_numero_ticket/siguiente_numero_recibo.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS siguiente_numero_traslado INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS siguiente_numero_pedido_sucursal INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON pedidos_sucursal TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON pedido_sucursal_items TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON traslados_stock TO empremas_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON traslado_items TO empremas_app;
    END IF;
END $$;
