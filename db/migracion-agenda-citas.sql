-- Modulo de Agenda de citas (peluquerias/salones) - apagado por defecto,
-- lo habilita EMPREMAS por empresa desde el panel admin (actualizarEmpresa),
-- NO el dueño - mismo criterio que produccion_habilitada/lomiteria_habilitada.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS citas_habilitadas BOOLEAN NOT NULL DEFAULT false;

-- Servicio agendable (corte, manicura...): se vende como cualquier producto
-- pero SIN stock (crearVenta lo salta, igual que a un es_compuesto pero sin
-- redirigir a insumos) y con una duracion fija que se congela en cada cita.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_servicio BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS duracion_minutos INTEGER;

-- Quien atiende una cita. Distinta de vendedores (modulo de Comisiones) para
-- no forzar a cada salon a configurar comision solo para poder agendar -
-- vendedor_id es un puente opcional hacia ese modulo, no una dependencia.
CREATE TABLE IF NOT EXISTS profesionales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    -- A diferencia de usuarios.sucursal_id (nullable, el dueño no tiene una
    -- fija), un profesional siempre atiende en un lugar fisico concreto.
    sucursal_id     UUID NOT NULL REFERENCES sucursales(id),
    nombre          TEXT NOT NULL,
    telefono        TEXT,
    usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    vendedor_id     UUID REFERENCES vendedores(id) ON DELETE SET NULL,
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profesionales_empresa ON profesionales (empresa_id);
ALTER TABLE profesionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesionales FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY profesionales_aislamiento ON profesionales
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE estado_cita AS ENUM ('pendiente', 'atendida', 'cancelada', 'no_asistio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- precio_unitario y duracion_minutos quedan congelados al reservar (mismo
-- criterio que presupuesto_items.precio_unitario).
CREATE TABLE IF NOT EXISTS citas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sucursal_id         UUID NOT NULL REFERENCES sucursales(id),
    profesional_id      UUID NOT NULL REFERENCES profesionales(id),
    -- Siempre una persona identificada (nunca "Consumidor Final") - mismo
    -- criterio que pedidos.cliente_id (Lomiteria).
    cliente_id          UUID NOT NULL REFERENCES clientes(id),
    producto_id         UUID NOT NULL REFERENCES productos(id),
    precio_unitario     NUMERIC(14,2) NOT NULL,
    fecha_hora_inicio   TIMESTAMPTZ NOT NULL,
    duracion_minutos    INTEGER NOT NULL,
    estado              estado_cita NOT NULL DEFAULT 'pendiente',
    nota                TEXT,
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citas_empresa ON citas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_citas_profesional_fecha ON citas (profesional_id, fecha_hora_inicio)
    WHERE estado <> 'cancelada';
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY citas_aislamiento ON citas
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Link venta <- cita, mismo patron que ventas.presupuesto_id/pedido_id.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cita_id UUID REFERENCES citas(id);
CREATE INDEX IF NOT EXISTS idx_ventas_cita ON ventas (cita_id) WHERE cita_id IS NOT NULL;

-- Nuevo permiso extra: solo protege ABM de profesionales (reservar/ver/
-- cobrar una cita queda abierto a cualquier rol, igual que Vender).
-- Sentencia propia, sin DO-wrap: ALTER TYPE ... ADD VALUE no corre dentro
-- de un bloque PL/pgSQL. "IF NOT EXISTS" (soportado desde PG12) la hace
-- idempotente sin necesitar ese wrap.
ALTER TYPE permiso_extra ADD VALUE IF NOT EXISTS 'gestionar_citas';

-- GRANT a la app (mismo criterio que el resto de migraciones de esta sesion).
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON profesionales, citas TO empremas_app;
    END IF;
END $$;
