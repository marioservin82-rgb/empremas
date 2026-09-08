-- Modulo de Nota de Recepcion (locales de reparacion de celulares /
-- electrodomesticos) - apagado por defecto, lo habilita EMPREMAS por
-- empresa desde el panel admin, NO el dueño - mismo criterio que
-- produccion_habilitada/lomiteria_habilitada/citas_habilitadas.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS reparaciones_habilitadas BOOLEAN NOT NULL DEFAULT false;

-- Numeracion correlativa propia, mismo patron que siguiente_numero_ticket/
-- siguiente_numero_recibo/siguiente_numero_presupuesto.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS siguiente_numero_reparacion INTEGER NOT NULL DEFAULT 1;

-- Texto legal/disclaimer impreso en la Nota de Recepcion. A diferencia de
-- reparaciones_habilitadas, ESTE campo SI lo edita el dueño desde Perfil
-- de Empresa (mismo criterio que recordatorio_mensaje_previo) - la letra
-- legal varia por rubro/jurisdiccion, no es EMPREMAS quien debe fijarla.
-- NULL o "" = usar el texto por defecto (constante en el frontend).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS reparaciones_nota_legal TEXT;

DO $$ BEGIN
    CREATE TYPE estado_reparacion AS ENUM
        ('recibido', 'en_reparacion', 'listo_para_entrega', 'entregado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A diferencia de una cita (precio conocido de antemano, por eso se
-- congela), el precio de una reparacion no se conoce al recibir el
-- equipo (hace falta diagnostico) - por eso esta tabla NO tiene
-- precio_unitario ni producto_id. El cobro, cuando corresponda, se hace
-- por Vender de forma independiente (ver ventas.reparacion_id).
CREATE TABLE IF NOT EXISTS reparaciones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sucursal_id         UUID NOT NULL REFERENCES sucursales(id),
    -- Siempre una persona identificada (nunca "Consumidor Final") - mismo
    -- criterio que citas.cliente_id.
    cliente_id          UUID NOT NULL REFERENCES clientes(id),
    numero              INTEGER NOT NULL,
    -- Texto libre a proposito, NO enum: un mismo local puede recibir
    -- celulares, electrodomesticos, notebooks, etc. La UI sugiere valores
    -- comunes como chips, pero la base no se restringe a una lista fija.
    tipo_equipo         TEXT NOT NULL,
    marca               TEXT,
    modelo              TEXT,
    numero_serie        TEXT,
    accesorios          TEXT,
    -- El detalle "a la vista" (rayones, golpes, pantalla rota...) al
    -- recibir el equipo - el pedido central de esta funcion.
    estado_recibido     TEXT NOT NULL,
    -- Lo que reporto el dueño del equipo (ej. "no enciende hace 2 dias").
    comentario_cliente  TEXT,
    -- Solo uso interno del local, nunca se imprime en la nota.
    nota_interna        TEXT,
    estado              estado_reparacion NOT NULL DEFAULT 'recibido',
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reparaciones_empresa ON reparaciones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_reparaciones_cliente ON reparaciones (cliente_id);
CREATE INDEX IF NOT EXISTS idx_reparaciones_estado ON reparaciones (empresa_id, estado);
ALTER TABLE reparaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reparaciones FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY reparaciones_aislamiento ON reparaciones
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Link venta <- reparacion, mismo patron que ventas.presupuesto_id/cita_id
-- PERO sin ninguna validacion en crearVenta (ver controller): a diferencia
-- de una cita, el precio no se conoce de antemano y el cobro no obliga a
-- cambiar el estado de la reparacion - es solo trazabilidad.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS reparacion_id UUID REFERENCES reparaciones(id);
CREATE INDEX IF NOT EXISTS idx_ventas_reparacion ON ventas (reparacion_id) WHERE reparacion_id IS NOT NULL;
