-- Ciclo de facturacion del cliente: define cada cuanto vence una venta a
-- credito hecha a este cliente puntual (semanal = 7 dias, mensual = el
-- plazo de dias de la empresa, como ya funcionaba). Default 'mensual' para
-- que los clientes existentes no cambien de comportamiento.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ciclo_facturacion TEXT NOT NULL DEFAULT 'mensual'
    CHECK (ciclo_facturacion IN ('semanal', 'mensual'));
