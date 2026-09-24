-- Acceso rápido favorito: un 6to botón grande configurable por el dueño
-- en el panel principal, para que la grilla quede siempre pareja (3x2)
-- en vez de desparejarse cuando el conteo natural de botones da 5 (4 fijos
-- + 1 del rubro vertical activo, o 4 fijos + solo "Pedido inteligente"
-- para un encargado). NULL = sin favorito elegido, la grilla queda como
-- salga (4 o 6 ya son parejos de por sí, solo 5 necesita este relleno).
-- El valor es una clave de OPCIONES_ACCESO_RAPIDO (frontend/lib/accesoRapido.js),
-- no una URL - así el frontend controla a qué rol/módulo aplica cada una.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS acceso_rapido_favorito TEXT;
