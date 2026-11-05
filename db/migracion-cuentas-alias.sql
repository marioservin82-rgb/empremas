-- Alias de la cuenta (ej. el alias SIPAP/Tigo Money para recibir transferencias).
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS alias TEXT;
