-- Pago a proveedor aplicado a compras concretas (mismo modelo que ventas:
-- saldo_pendiente por documento + tabla de aplicaciones del pago).

ALTER TABLE compras ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pago_proveedor_aplicaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    pago_id         UUID NOT NULL REFERENCES pagos_proveedor(id) ON DELETE CASCADE,
    compra_id       UUID NOT NULL REFERENCES compras(id),
    monto_aplicado  NUMERIC(14,2) NOT NULL CHECK (monto_aplicado > 0)
);

CREATE INDEX IF NOT EXISTS idx_pago_prov_aplic_empresa ON pago_proveedor_aplicaciones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pago_prov_aplic_pago ON pago_proveedor_aplicaciones (pago_id);
CREATE INDEX IF NOT EXISTS idx_pago_prov_aplic_compra ON pago_proveedor_aplicaciones (compra_id);

ALTER TABLE pago_proveedor_aplicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pago_proveedor_aplicaciones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pago_proveedor_aplicaciones_aislamiento ON pago_proveedor_aplicaciones;
CREATE POLICY pago_proveedor_aplicaciones_aislamiento ON pago_proveedor_aplicaciones
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Backfill de las compras a credito historicas: el saldo actual de cada
-- proveedor se explica con las compras a credito MAS RECIENTES (los pagos
-- cancelaron primero las mas viejas). Recorriendo de la mas nueva a la mas
-- vieja: saldo_pendiente = min(total, saldo restante). Lo que sobre del
-- saldo (saldo inicial, ajustes manuales) queda como "deuda sin factura".
-- Se hace empresa por empresa con el contexto de tenant puesto, porque
-- compras tiene RLS forzada.
DO $$
DECLARE
    emp RECORD;
BEGIN
    FOR emp IN SELECT id FROM empresas LOOP
        PERFORM set_config('app.empresa_actual', emp.id::text, true);
        UPDATE compras SET saldo_pendiente = 0 WHERE empresa_id = emp.id;
        WITH ordenadas AS (
            SELECT c.id, c.total, GREATEST(p.saldo, 0) AS saldo,
                   SUM(c.total) OVER (
                       PARTITION BY c.proveedor_id
                       ORDER BY c.fecha_compra DESC, c.creado_en DESC, c.id
                   ) AS acumulado
              FROM compras c
              JOIN proveedores p ON p.id = c.proveedor_id
             WHERE c.empresa_id = emp.id AND c.tipo_pago = 'credito' AND c.anulada = false
        )
        UPDATE compras c
           SET saldo_pendiente = GREATEST(0, LEAST(o.total, o.saldo - (o.acumulado - o.total)))
          FROM ordenadas o
         WHERE c.id = o.id;
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empremas_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON pago_proveedor_aplicaciones TO empremas_app;
    END IF;
END $$;
