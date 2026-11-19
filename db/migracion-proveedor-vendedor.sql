-- Vendedor de contacto del proveedor: el negocio se comunica con una persona
-- (el vendedor), no con la empresa. Opcional. Idempotente.
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS vendedor_nombre TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS vendedor_celular TEXT;
