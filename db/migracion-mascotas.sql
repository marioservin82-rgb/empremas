-- Modulo de Mascotas (veterinaria / guarderia de mascotas) - apagado por
-- defecto, lo habilita EMPREMAS por empresa desde el panel admin, NO el
-- dueño - mismo criterio que produccion_habilitada/citas_habilitadas/
-- reparaciones_habilitadas.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS mascotas_habilitadas BOOLEAN NOT NULL DEFAULT false;

-- Numeracion correlativa para internaciones, mismo patron que
-- siguiente_numero_ticket/siguiente_numero_reparacion.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS siguiente_numero_internacion INTEGER NOT NULL DEFAULT 1;

-- Ficha de la mascota, vinculada a un cliente (el dueño) - mismo criterio
-- que reparaciones.cliente_id: siempre una persona identificada.
CREATE TABLE IF NOT EXISTS mascotas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id          UUID NOT NULL REFERENCES clientes(id),
    nombre              TEXT NOT NULL,
    -- Texto libre a proposito, NO enum: perro/gato/ave/exotico/etc, cada
    -- local atiende especies distintas.
    especie             TEXT NOT NULL,
    raza                TEXT,
    fecha_nacimiento    DATE,
    sexo                TEXT,
    peso_kg             NUMERIC(6,2),
    -- Alergias, condiciones cronicas, cualquier cosa que el veterinario
    -- necesite tener a mano.
    notas               TEXT,
    activo              BOOLEAN NOT NULL DEFAULT true,
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mascotas_empresa ON mascotas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_mascotas_cliente ON mascotas (cliente_id);
ALTER TABLE mascotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mascotas FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY mascotas_aislamiento ON mascotas
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Citas: vinculo opcional a una mascota (tratamiento o analisis en
-- veterinaria/guarderia) y un resultado de texto libre (valores de un
-- analisis de laboratorio, evolucion del tratamiento). Ambos quedan NULL
-- para una cita comun de salon/barberia - no cambia nada de lo existente.
ALTER TABLE citas ADD COLUMN IF NOT EXISTS mascota_id UUID REFERENCES mascotas(id);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS resultado TEXT;
CREATE INDEX IF NOT EXISTS idx_citas_mascota ON citas (mascota_id) WHERE mascota_id IS NOT NULL;

-- Ficha de vacunacion por mascota. fecha_proximo_refuerzo es lo que
-- alimenta el listado de alertas (mismo espiritu que clientesCumpleanos:
-- se calculan los dias que faltan al vuelo, no se guarda un flag aparte).
CREATE TABLE IF NOT EXISTS vacunas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    mascota_id              UUID NOT NULL REFERENCES mascotas(id) ON DELETE CASCADE,
    nombre_vacuna           TEXT NOT NULL,
    fecha_aplicacion        DATE NOT NULL,
    fecha_proximo_refuerzo  DATE,
    nota                    TEXT,
    usuario_id              UUID NOT NULL REFERENCES usuarios(id),
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vacunas_mascota ON vacunas (mascota_id);
CREATE INDEX IF NOT EXISTS idx_vacunas_refuerzo ON vacunas (empresa_id, fecha_proximo_refuerzo) WHERE fecha_proximo_refuerzo IS NOT NULL;
ALTER TABLE vacunas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacunas FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY vacunas_aislamiento ON vacunas
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Internacion (hospedaje/hospitalizacion): a diferencia de una cita, no
-- tiene un precio conocido de antemano (depende de cuantos dias se quede) -
-- por eso NO tiene un total calculado solo. Al dar de alta se carga el
-- total a mano y "Cobrar" manda a Vender, mismo criterio que Reparaciones:
-- sin validacion de estado, sin congelar precio, sin forzar el alta al
-- cobrar (se puede cobrar antes o despues de la salida real).
DO $$ BEGIN
    CREATE TYPE estado_internacion AS ENUM ('internado', 'dado_de_alta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS internaciones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sucursal_id         UUID NOT NULL REFERENCES sucursales(id),
    mascota_id          UUID NOT NULL REFERENCES mascotas(id),
    numero              INTEGER NOT NULL,
    motivo              TEXT NOT NULL,
    tarifa_diaria       NUMERIC(14,2),
    fecha_ingreso       TIMESTAMPTZ NOT NULL DEFAULT now(),
    nota_ingreso        TEXT,
    estado              estado_internacion NOT NULL DEFAULT 'internado',
    fecha_alta          TIMESTAMPTZ,
    nota_alta           TEXT,
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_internaciones_empresa ON internaciones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_internaciones_mascota ON internaciones (mascota_id);
CREATE INDEX IF NOT EXISTS idx_internaciones_estado ON internaciones (empresa_id, estado);
ALTER TABLE internaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE internaciones FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY internaciones_aislamiento ON internaciones
        USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Venta <- internacion, mismo patron que ventas.reparacion_id/cita_id:
-- solo trazabilidad, sin validacion en crearVenta.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS internacion_id UUID REFERENCES internaciones(id);
CREATE INDEX IF NOT EXISTS idx_ventas_internacion ON ventas (internacion_id) WHERE internacion_id IS NOT NULL;
