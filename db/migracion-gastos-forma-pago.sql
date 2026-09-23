-- Forma de pago al cargar un gasto puntual - mismo criterio que ya existe
-- para compra_pagos: si se paga en efectivo, hay que saber si sale de la
-- caja (genera un retiro de caja automatico, para que la reconciliacion
-- de cierre de turno lo refleje solo) o de administracion (no toca caja).
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS forma_pago forma_pago_venta;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS origen TEXT CHECK (origen IN ('administracion', 'caja'));

-- Si el retiro lo genero automaticamente el pago de un gasto en efectivo
-- "de la caja" (para poder revertirlo si se borra el gasto), mismo
-- patron que retiros_caja.compra_id.
ALTER TABLE retiros_caja ADD COLUMN IF NOT EXISTS gasto_id UUID REFERENCES gastos(id);
