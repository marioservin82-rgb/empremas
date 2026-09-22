-- Modulo de Recomendacion de margen - apagado por defecto, lo habilita
-- EMPREMAS por empresa desde el panel admin, NO el dueño - mismo
-- criterio que produccion_habilitada/citas_habilitadas/mascotas_habilitadas.
-- Nunca cambia ningun precio solo: el backend solo calcula un numero
-- sugerido, el dueño decide que precio cargar.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS recomendacion_margen_habilitada BOOLEAN NOT NULL DEFAULT false;

-- Meta de ganancia mensual - a diferencia del toggle de arriba, ESTE
-- campo SI lo edita el dueño (Perfil de Empresa), es el input principal
-- del calculo. NULL = todavia no la configuro, sin eso no hay
-- recomendacion posible.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS meta_ganancia_mensual NUMERIC(14,2);

DO $$ BEGIN
    CREATE TYPE categoria_rotacion AS ENUM ('alta', 'media', 'baja');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hint manual solo para un producto sin historial de ventas todavia
-- (recien comprado por primera vez): el dueño puede adivinar la
-- rotacion esperada para tener una sugerencia mientras junta datos
-- reales. En cuanto el producto tenga ventas en la ventana de analisis,
-- el backend ignora este campo y clasifica por historial real.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria_rotacion_manual categoria_rotacion;
