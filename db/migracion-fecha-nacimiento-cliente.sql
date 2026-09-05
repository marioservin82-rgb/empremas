-- Fecha de nacimiento del cliente (opcional) - para que el negocio pueda
-- ofrecerle algo especial el dia de su cumpleanos (restaurantes, salones
-- de belleza, etc.) y como dato general de la ficha.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
