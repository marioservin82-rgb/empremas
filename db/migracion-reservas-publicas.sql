-- Reservas públicas: la clienta reserva sin login, con nombre y celular,
-- conectada al módulo real de Agenda de citas.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS reservas_publicas_habilitadas BOOLEAN NOT NULL DEFAULT false;

-- Una reserva publica no tiene ningun usuario de EMPREMAS logueado detras.
ALTER TABLE citas ALTER COLUMN usuario_id DROP NOT NULL;

-- Fotos por servicio (galeria publica) - suben a un storage externo
-- (Cloudinary), acá solo se guarda la URL resultante.
CREATE TABLE IF NOT EXISTS servicio_fotos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id  UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    url_imagen   TEXT NOT NULL,
    orden        INTEGER NOT NULL DEFAULT 0,
    activo       BOOLEAN NOT NULL DEFAULT true,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servicio_fotos_producto ON servicio_fotos (producto_id) WHERE activo = true;
-- Sin RLS propia: siempre se consulta a traves de su producto padre (mismo
-- criterio que venta_items respecto de ventas).
