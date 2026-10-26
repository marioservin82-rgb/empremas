-- Presupuesto: forma de pago (texto libre, ej. "Contado", "Crédito 30 días")
-- y observación opcional, ambas se imprimen en el presupuesto.
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS forma_pago TEXT;
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS observacion TEXT;
