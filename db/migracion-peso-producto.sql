-- Peso por unidad de venta del producto (kg). Opcional: sirve para calcular el
-- peso total de un presupuesto y saber que camion hace falta para el envio.
-- Es el peso de UNA unidad de la unidad_medida del producto (ej. 1 bolsa = 50 kg,
-- 1 metro = 1,2 kg). Idempotente.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(12,3);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_peso_kg_positivo') THEN
        ALTER TABLE productos ADD CONSTRAINT productos_peso_kg_positivo CHECK (peso_kg IS NULL OR peso_kg > 0);
    END IF;
END $$;
