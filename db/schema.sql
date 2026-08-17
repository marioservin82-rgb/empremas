-- EMPREMAS - Esquema base multiempresa (Plataforma -> Empresa -> Sucursal -> Usuario)
-- Etapa 1, punto 1 del plan: estructura base + modelo de datos multiempresa

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Para que buscar "maria" encuentre "María" (el usuario tipico no escribe tildes al buscar).
CREATE EXTENSION IF NOT EXISTS "unaccent";

CREATE TYPE rol_usuario AS ENUM ('dueno', 'encargado', 'cajero');
CREATE TYPE estado_empresa AS ENUM ('prueba', 'activa', 'mora', 'suspendida');

-- Empresa = tenant. Todo lo demás cuelga de aca via empresa_id.
CREATE TABLE empresas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razon_social    TEXT NOT NULL,
    ruc             TEXT NOT NULL UNIQUE,
    timbrado        TEXT,
    direccion       TEXT,
    plan            TEXT NOT NULL DEFAULT 'estandar',
    estado          estado_empresa NOT NULL DEFAULT 'prueba',
    -- Si esta en false (por defecto), el POS bloquea una venta cuando el
    -- producto no tiene stock suficiente. El dueno puede activarlo si
    -- prefiere permitir vender igual (el stock queda en negativo).
    permitir_venta_sin_stock BOOLEAN NOT NULL DEFAULT false,
    -- Dias de plazo para el vencimiento de una venta a credito (fiado).
    plazo_credito_dias         INTEGER NOT NULL DEFAULT 30,
    -- Numeracion correlativa de los recibos de cobro (1, 2, 3...). Se
    -- incrementa con un UPDATE (bloquea la fila de la empresa) para que
    -- dos cobros al mismo tiempo nunca saquen el mismo numero.
    siguiente_numero_recibo    INTEGER NOT NULL DEFAULT 1,
    -- Numeracion correlativa de los tickets de venta (distinta de la de
    -- recibos de cobro) - mismo mecanismo de UPDATE...RETURNING.
    siguiente_numero_ticket    INTEGER NOT NULL DEFAULT 1,
    -- Limites de plan (los edita el admin de la plataforma desde su panel,
    -- nunca el propio dueno de la empresa). limite_sucursales reemplaza al
    -- viejo multi_sucursal_habilitado booleano: "hasta N sucursales" en
    -- vez de un simple on/off, mismo mecanismo que limite_usuarios.
    limite_usuarios     INTEGER NOT NULL DEFAULT 3,
    limite_sucursales   INTEGER NOT NULL DEFAULT 1,
    -- Hasta cuando cubre el ultimo pago registrado - lo actualiza
    -- pagos_plataforma al registrar un pago. Null hasta el primer pago.
    vence_en            DATE,
    -- Configuracion de facturacion electronica (SIFEN via Sifende). Nulo =
    -- todavia no configurado - asi decide el frontend si "Factura Legal"
    -- esta habilitada, sin necesitar una columna booleana aparte. El
    -- ambiente (sandbox/produccion) no se guarda: Sifende lo resuelve solo
    -- por el prefijo de la key (sk_test_/sk_live_).
    sifen_api_key           TEXT,
    sifen_establecimiento   INTEGER NOT NULL DEFAULT 1,
    -- Telefono de contacto de la empresa (no del dueno/usuario puntual) -
    -- pensado para figurar en la Factura Legal, editable junto al resto
    -- de la config de SIFEN.
    telefono                TEXT,
    -- Logo de la empresa, como data URI (ej. "data:image/png;base64,...").
    -- Se guarda aparte de las demas columnas de empresas en su propio
    -- endpoint (GET/PATCH /api/empresas/logo) para que pantallas que solo
    -- necesitan datos chicos (ej. el probe de Vender) no tengan que bajar
    -- un blob grande en cada carga.
    logo                    TEXT,
    -- Escala del texto del ticket termico (80mm), en % (100 = tamaño
    -- normal). Configurable porque el tamaño "legible" depende de la
    -- impresora/driver de cada comercio - se ajusta a prueba y error
    -- desde /configuracion/impresora, aplicado como CSS zoom sobre el
    -- ticket (ver Recibo.js/ReciboCobro.js/PresupuestoImprimible.js).
    ticket_escala           INTEGER NOT NULL DEFAULT 100 CHECK (ticket_escala BETWEEN 50 AND 300),
    -- Perfil de empresa: contacto y trazabilidad de datos fiscales. El
    -- certificado SIFEN no se guarda como archivo (Sifende firma con el
    -- que cada comercio carga directo en su propio panel, no con el
    -- nuestro) - solo vencimiento/nota para que el dueno lleve registro.
    email                       TEXT,
    direccion_atencion         TEXT,
    sifen_cert_vencimiento     DATE,
    sifen_cert_nota             TEXT,
    datos_fiscales_modificado_en   TIMESTAMPTZ,
    datos_fiscales_modificado_por  UUID REFERENCES usuarios(id),
    -- Nombre de la impresora de Windows a usar por el agente de impresion
    -- local (ver /agente-impresion) - null = agente no configurado, sigue
    -- imprimiendo con window.print() como siempre.
    impresora_agente_nombre        TEXT,
    -- Recordatorio de pago por vencimiento (WhatsApp/copiar mensaje). Los
    -- dos umbrales son ajustables por el dueno; las 4 plantillas quedan
    -- NULL por defecto = usar la plantilla de fabrica (vive en el
    -- frontend, ver frontend/lib/recordatorios.js), no hace falta
    -- duplicarla aca.
    recordatorio_dias_aviso_previo         INTEGER NOT NULL DEFAULT 3,
    recordatorio_dias_mora_prolongada      INTEGER NOT NULL DEFAULT 7,
    recordatorio_incluir_ruc               BOOLEAN NOT NULL DEFAULT true,
    recordatorio_incluir_telefono          BOOLEAN NOT NULL DEFAULT true,
    recordatorio_mensaje_previo            TEXT,
    recordatorio_mensaje_hoy               TEXT,
    recordatorio_mensaje_mora_leve         TEXT,
    recordatorio_mensaje_mora_prolongada   TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sucursal: cada local fisico de una empresa, con su propio punto de expedicion SIFEN.
-- Toda empresa tiene siempre al menos una (creada automaticamente al
-- registrarse), tenga limite_sucursales 1 o mas - asi el resto del
-- sistema (stock, turnos) siempre resuelve contra una sucursal real, sin
-- tener que ramificar entre "con sucursal" / "sin sucursal".
CREATE TABLE sucursales (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre              TEXT NOT NULL,
    punto_expedicion    TEXT,
    direccion           TEXT,
    activa              BOOLEAN NOT NULL DEFAULT true,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sucursales_empresa ON sucursales (empresa_id);

-- Usuario: pertenece a una empresa y siempre a una sucursal (la unica de
-- la empresa si limite_sucursales es 1). Nullable a nivel de columna solo
-- por el ON DELETE SET NULL - la app siempre la completa.
CREATE TABLE usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sucursal_id     UUID REFERENCES sucursales(id) ON DELETE SET NULL,
    nombre          TEXT NOT NULL,
    -- El dueno se registra con email O telefono (no los dos obligatorios) -
    -- por eso ninguno de los dos es NOT NULL por si solo, pero el CHECK de
    -- abajo exige que haya al menos uno. UNIQUE permite multiples NULL sin
    -- pisarse (Postgres no considera NULL = NULL para UNIQUE).
    email           TEXT UNIQUE,
    telefono        TEXT UNIQUE,
    password_hash   TEXT NOT NULL,
    rol             rol_usuario NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT true,
    -- PIN numerico corto (dueno/encargado) para autorizar en el momento
    -- acciones sensibles (ej. anular una venta) sin que un cajero tenga
    -- que pedir la contraseña completa de otra persona. Null hasta que esa
    -- persona lo configure. Hasheado igual que password_hash, nunca en
    -- texto plano.
    pin_hash        TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT usuarios_email_o_telefono CHECK (email IS NOT NULL OR telefono IS NOT NULL)
);

CREATE INDEX idx_usuarios_empresa ON usuarios (empresa_id);

-- Row-Level Security: segunda capa de aislamiento ademas del filtro por codigo.
-- La app, al conectar, setea: SELECT set_config('app.empresa_actual', '<uuid>', true).
-- usuarios NO lleva RLS a proposito: el login busca por email antes de saber
-- a que empresa pertenece esa persona, asi que esa consulta no puede tener
-- un filtro de empresa todavia. Para cualquier otra consulta sobre usuarios
-- (ej. listar empleados) el aislamiento se hace por codigo (WHERE empresa_id
-- = ...), como primera capa, ya que la segunda capa (RLS) no aplica aca.
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;

CREATE POLICY sucursales_aislamiento ON sucursales
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Permisos extra por empleado, encima de los 3 roles fijos (dueno/
-- encargado/cajero). Solo tiene sentido conceder estos a un cajero
-- puntual (dueno/encargado ya tienen todo) - ej. un cajero de confianza
-- al que se le da acceso a reportes sin ascenderlo a encargado. Nunca
-- incluye gestion de empleados/sucursales/config de empresa - eso queda
-- exclusivo de dueno pase lo que pase.
CREATE TYPE permiso_extra AS ENUM (
    'ver_costos',
    'ver_reportes',
    'gestionar_inventario',
    'gestionar_compras',
    'gestionar_clientes',
    'anular_sin_pin'
);

CREATE TABLE usuario_permisos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    permiso     permiso_extra NOT NULL,
    UNIQUE (usuario_id, permiso)
);

CREATE INDEX idx_usuario_permisos_empresa ON usuario_permisos (empresa_id);
CREATE INDEX idx_usuario_permisos_usuario ON usuario_permisos (usuario_id);

ALTER TABLE usuario_permisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY usuario_permisos_aislamiento ON usuario_permisos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Control de caja por turno: el cajero abre con un monto inicial
-- declarado, vende/cobra durante el turno, y al cerrar el sistema compara
-- lo que declara contra lo que deberia haber segun ventas/cobros/pagos de
-- ese turno. Un turno es de un usuario puntual (cada cajero el suyo), no
-- compartido - por eso el "abrir" falla si ese usuario ya tiene uno abierto.
CREATE TYPE estado_turno AS ENUM ('abierto', 'cerrado');

CREATE TABLE turnos (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id              UUID NOT NULL REFERENCES usuarios(id),
    -- Sucursal del usuario que abrio el turno, para que la caja de cada
    -- local se reconcilie por separado en una empresa multi-sucursal.
    sucursal_id             UUID REFERENCES sucursales(id),
    estado                  estado_turno NOT NULL DEFAULT 'abierto',
    monto_inicial           NUMERIC(14,2) NOT NULL,
    -- Calculado al cerrar: cuanto efectivo deberia haber segun lo vendido
    -- y cobrado en efectivo durante el turno (menos vueltos y pagos a
    -- proveedor en efectivo), y cuanto declaro el cajero que hay realmente.
    efectivo_esperado       NUMERIC(14,2),
    monto_declarado_cierre  NUMERIC(14,2),
    diferencia              NUMERIC(14,2),
    abierto_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
    cerrado_en              TIMESTAMPTZ
);

CREATE INDEX idx_turnos_empresa ON turnos (empresa_id);
CREATE INDEX idx_turnos_usuario_abierto ON turnos (usuario_id) WHERE estado = 'abierto';

ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;

CREATE POLICY turnos_aislamiento ON turnos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Retiro de efectivo de caja: cualquier salida de plata del turno que no
-- sea una venta ni un gasto cargado por otro medio (pago a proveedor en
-- efectivo puntual, gasto puntual, retiro personal del dueno, envio con
-- un tercero, u otro motivo). usuario_id es quien lo registra (puede ser
-- el cajero); autorizado_por es quien autorizo de verdad - el mismo si ya
-- es dueno/encargado, o el supervisor cuyo PIN coincidio si lo registro
-- un cajero (mismo patron que ventas.anulada_por).
CREATE TYPE motivo_retiro AS ENUM ('pago_proveedor', 'gasto_puntual', 'retiro_personal', 'envio_tercero', 'otro');

CREATE TABLE retiros_caja (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    turno_id        UUID NOT NULL REFERENCES turnos(id),
    sucursal_id     UUID REFERENCES sucursales(id),
    monto           NUMERIC(14,2) NOT NULL,
    motivo          motivo_retiro NOT NULL,
    motivo_detalle  TEXT,
    persona_retira  TEXT NOT NULL,
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    autorizado_por  UUID NOT NULL REFERENCES usuarios(id),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_retiros_caja_empresa ON retiros_caja (empresa_id);
CREATE INDEX idx_retiros_caja_turno ON retiros_caja (empresa_id, turno_id);

ALTER TABLE retiros_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY retiros_caja_aislamiento ON retiros_caja
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Catalogo de productos + stock (punto 2 del MVP)
CREATE TABLE productos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    codigo_barras   TEXT,
    nombre          TEXT NOT NULL,
    unidad_medida   TEXT NOT NULL DEFAULT 'unidad',
    precio_costo      NUMERIC(14,2) NOT NULL DEFAULT 0,
    precio_contado    NUMERIC(14,2) NOT NULL DEFAULT 0,
    precio_credito    NUMERIC(14,2) NOT NULL DEFAULT 0,
    precio_mayorista  NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- Los precios de arriba ya incluyen el IVA. Esta tasa es la que se usa
    -- para desglosar el IVA de cada precio al momento de facturar (SIFEN
    -- exige el monto gravado y el monto de IVA por separado, no solo el total).
    tasa_iva          SMALLINT NOT NULL DEFAULT 10 CHECK (tasa_iva IN (0, 5, 10)),
    -- El stock ya NO vive aca (ver tabla producto_stock, mas abajo) - un
    -- producto puede tener cantidades distintas en cada sucursal. Lo que
    -- si sigue siendo unico por producto (no por sucursal) es el umbral
    -- de alerta de reposicion.
    stock_minimo    NUMERIC(14,3),
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_productos_empresa ON productos (empresa_id);
CREATE INDEX idx_productos_codigo_barras ON productos (empresa_id, codigo_barras);
CREATE INDEX idx_productos_nombre ON productos (empresa_id, lower(nombre));

ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY productos_aislamiento ON productos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Stock de un producto en una sucursal puntual. Una empresa con una sola
-- sucursal tiene, en la practica, una sola fila por producto aca - el
-- diseño es el mismo haya 1 o varias sucursales, sin ramas de codigo
-- distintas para cada caso.
CREATE TABLE producto_stock (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    sucursal_id     UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    stock           NUMERIC(14,3) NOT NULL DEFAULT 0,
    UNIQUE (producto_id, sucursal_id)
);

CREATE INDEX idx_producto_stock_empresa ON producto_stock (empresa_id);
CREATE INDEX idx_producto_stock_producto ON producto_stock (producto_id);
CREATE INDEX idx_producto_stock_sucursal ON producto_stock (sucursal_id);

ALTER TABLE producto_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY producto_stock_aislamiento ON producto_stock
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Ajuste de inventario: correccion manual del stock (conteo fisico,
-- rotura, vencido, robo, etc.), con motivo obligatorio para dejar rastro
-- de por que cambio.
CREATE TABLE ajustes_inventario (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    producto_id         UUID NOT NULL REFERENCES productos(id),
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    -- Sucursal donde se hizo el ajuste (el stock que se esta corrigiendo
    -- es el de esa sucursal puntual).
    sucursal_id         UUID REFERENCES sucursales(id),
    cantidad_anterior   NUMERIC(14,3) NOT NULL,
    cantidad_nueva      NUMERIC(14,3) NOT NULL,
    diferencia          NUMERIC(14,3) NOT NULL,
    motivo              TEXT NOT NULL,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ajustes_inventario_empresa ON ajustes_inventario (empresa_id);
CREATE INDEX idx_ajustes_inventario_producto ON ajustes_inventario (empresa_id, producto_id);

ALTER TABLE ajustes_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY ajustes_inventario_aislamiento ON ajustes_inventario
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Clientes + fiado (linea de credito). Prerrequisito de la pantalla de
-- Vender: la "regla de oro" (mostrar credito y saldo antes de cargar
-- productos) necesita que este dato exista primero.
CREATE TABLE clientes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    documento       TEXT,
    telefono        TEXT,
    -- Aparte de telefono (fijo): el celular es el que sirve para
    -- recordatorios por WhatsApp.
    celular         TEXT,
    -- email y direccion: datos que pide la factura electronica SIFEN sobre
    -- el receptor (y el email sirve ademas para mandarle la factura).
    email           TEXT,
    direccion       TEXT,
    -- linea_credito: cuanto se le permite deber como maximo. saldo: cuanto
    -- debe hoy. saldo_disponible = linea_credito - saldo, se calcula al leer.
    linea_credito   NUMERIC(14,2) NOT NULL DEFAULT 0,
    saldo           NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- Toda venta necesita un comprador. Para no obligar al cajero a elegir
    -- o crear un cliente real en cada venta chica de mostrador, cada
    -- empresa tiene un cliente generico "Consumidor Final" (es_generico =
    -- true) que se usa automaticamente cuando no se elige ninguno.
    es_generico     BOOLEAN NOT NULL DEFAULT false,
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_empresa ON clientes (empresa_id);
CREATE INDEX idx_clientes_nombre ON clientes (empresa_id, lower(nombre));
CREATE INDEX idx_clientes_documento ON clientes (empresa_id, documento);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY clientes_aislamiento ON clientes
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Ajuste de saldo de cliente: mismo espiritu que ajustes_inventario (mas
-- abajo) pero para clientes.saldo - permite migrar un cliente con deuda
-- ya existente de otro sistema, o corregir un saldo mal cargado, siempre
-- con motivo obligatorio y dejando rastro de quien y cuando.
CREATE TABLE ajustes_saldo_cliente (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id      UUID NOT NULL REFERENCES clientes(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    saldo_anterior  NUMERIC(14,2) NOT NULL,
    saldo_nuevo     NUMERIC(14,2) NOT NULL,
    diferencia      NUMERIC(14,2) NOT NULL,
    motivo          TEXT NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ajustes_saldo_cliente_empresa ON ajustes_saldo_cliente (empresa_id);
CREATE INDEX idx_ajustes_saldo_cliente_cliente ON ajustes_saldo_cliente (empresa_id, cliente_id);

ALTER TABLE ajustes_saldo_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY ajustes_saldo_cliente_aislamiento ON ajustes_saldo_cliente
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Ventas (punto 3 del MVP: POS). tipo_pago define tanto que lista de
-- precio del producto se usa (contado/credito/mayorista) como si afecta
-- el saldo del cliente: solo 'credito' es fiado, contado y mayorista se
-- cobran en el momento (a distinto precio).
CREATE TYPE tipo_pago_venta AS ENUM ('contado', 'credito', 'mayorista');

-- Como se cobro efectivamente. No aplica a una venta a credito (fiado):
-- ahi no se cobra nada en el momento, por eso forma_pago queda NULL.
CREATE TYPE forma_pago_venta AS ENUM ('efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito');

-- Que comprobante se imprimio/genero para el comprador. 'factura_legal'
-- solo se acepta si la empresa tiene SIFEN configurado (empresas.sifen_api_key),
-- ver crearVenta - sin eso, se sigue rechazando igual que antes.
CREATE TYPE tipo_comprobante_venta AS ENUM ('ticket_comun', 'a4', 'sin_comprobante', 'factura_legal');

CREATE TABLE ventas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    -- Nunca queda NULL en la practica: si no se elige un cliente puntual,
    -- se usa el "Consumidor Final" generico de la empresa.
    cliente_id      UUID NOT NULL REFERENCES clientes(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    -- Turno abierto del usuario al momento de vender (NULL si vendio sin
    -- tener uno abierto) - asi el cierre de caja sabe que ventas contar.
    turno_id        UUID REFERENCES turnos(id),
    -- Sucursal de quien vendio (independiente de si tenia turno abierto) -
    -- necesario para saber a que sucursal devolver el stock si se anula.
    sucursal_id     UUID REFERENCES sucursales(id),
    -- Numeracion correlativa del ticket (independiente del CDC de SIFEN,
    -- que solo existe si es Factura Legal) - asignado con el mismo
    -- mecanismo de UPDATE...RETURNING que numero_recibo en cobros.
    numero_ticket   INTEGER,
    tipo_pago       tipo_pago_venta NOT NULL,
    -- El vuelto es una propiedad de toda la venta (solo el efectivo puede
    -- dar vuelto), pero como puede haber varios metodos de cobro mezclados
    -- (ej. mitad efectivo, mitad tarjeta), el detalle de cada metodo vive
    -- en venta_pagos, no aca.
    vuelto          NUMERIC(14,2),
    total           NUMERIC(14,2) NOT NULL,
    -- Solo se usan cuando tipo_pago = 'credito': fecha limite para cobrar
    -- (creado_en + empresas.plazo_credito_dias) y cuanto de esta factura
    -- especifica sigue sin cobrarse (arranca en total, baja con cada cobro
    -- aplicado). Permiten ordenar por vencimiento y aplicar un cobro a
    -- varias facturas automaticamente, de la mas vencida a la mas nueva.
    vencimiento     DATE,
    saldo_pendiente NUMERIC(14,2) NOT NULL DEFAULT 0,
    tipo_comprobante tipo_comprobante_venta NOT NULL DEFAULT 'ticket_comun',
    -- Si esta venta nacio de convertir un presupuesto, queda el link (no
    -- bloquea al presupuesto, que sigue disponible para otra conversion).
    presupuesto_id  UUID,
    -- Anulacion: revierte stock y saldo de cliente (ver anularVenta), pero
    -- la fila NUNCA se borra - queda con estos campos para auditoria (que
    -- se anulo, cuando, quien la autorizo y por que). anulada_por puede ser
    -- el propio usuario (si es dueno/encargado) o el supervisor que dio el
    -- PIN (si quien vendio era cajero).
    anulada         BOOLEAN NOT NULL DEFAULT false,
    anulada_en      TIMESTAMPTZ,
    anulada_por     UUID REFERENCES usuarios(id),
    motivo_anulacion TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un pago hibrido (parte efectivo, parte tarjeta/transferencia) se guarda
-- como varias filas: una por cada metodo usado en la misma venta. Una
-- venta a credito (fiado) no tiene filas aca, porque no se cobra nada ahora.
CREATE TABLE venta_pagos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    venta_id        UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    forma_pago      forma_pago_venta NOT NULL,
    monto           NUMERIC(14,2) NOT NULL
);

CREATE TABLE venta_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    venta_id        UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES productos(id),
    cantidad        NUMERIC(14,3) NOT NULL,
    -- precio_unitario queda "congelado" al momento de la venta: si despues
    -- cambia el precio del producto, las ventas viejas no deben cambiar.
    precio_unitario NUMERIC(14,2) NOT NULL,
    subtotal        NUMERIC(14,2) NOT NULL
);

CREATE INDEX idx_ventas_empresa ON ventas (empresa_id);
CREATE INDEX idx_ventas_cliente ON ventas (empresa_id, cliente_id);
CREATE INDEX idx_venta_pagos_empresa ON venta_pagos (empresa_id);
CREATE INDEX idx_venta_pagos_venta ON venta_pagos (venta_id);
CREATE INDEX idx_venta_items_empresa ON venta_items (empresa_id);
CREATE INDEX idx_venta_items_venta ON venta_items (venta_id);

ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ventas_aislamiento ON ventas
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE POLICY venta_pagos_aislamiento ON venta_pagos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE POLICY venta_items_aislamiento ON venta_items
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Presupuesto/preventa: una cotizacion guardada, reutilizable (no se marca
-- "consumida" al convertirse en venta, se puede volver a usar mas adelante
-- - ver ventas.presupuesto_id mas abajo, que registra cada conversion sin
-- bloquear el presupuesto para la proxima vez).
CREATE TABLE presupuestos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    -- A diferencia de ventas, el cliente es opcional: un presupuesto puede
    -- ser una cotizacion general (ej. "juego de baño") que se muestra a
    -- cualquiera que pregunte, no necesariamente atada a una persona.
    cliente_id      UUID REFERENCES clientes(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    -- Que lista de precios se uso como base al armar el presupuesto
    -- (contado/credito/mayorista) - cada item puede despues pisar ese
    -- precio a mano (ver presupuesto_items.precio_unitario).
    lista_precio    tipo_pago_venta NOT NULL DEFAULT 'contado',
    vencimiento     DATE NOT NULL,
    total           NUMERIC(14,2) NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE presupuesto_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    presupuesto_id  UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES productos(id),
    cantidad        NUMERIC(14,3) NOT NULL,
    -- Precio modificable a mano por item (ej. para negociar un descuento
    -- en el total cotizado) - no tiene que coincidir con el precio de
    -- lista_precio del producto.
    precio_unitario NUMERIC(14,2) NOT NULL,
    subtotal        NUMERIC(14,2) NOT NULL
);

CREATE INDEX idx_presupuestos_empresa ON presupuestos (empresa_id);
CREATE INDEX idx_presupuestos_cliente ON presupuestos (empresa_id, cliente_id);
CREATE INDEX idx_presupuesto_items_empresa ON presupuesto_items (empresa_id);
CREATE INDEX idx_presupuesto_items_presupuesto ON presupuesto_items (presupuesto_id);

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY presupuestos_aislamiento ON presupuestos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE POLICY presupuesto_items_aislamiento ON presupuesto_items
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- ventas.presupuesto_id se declara arriba sin REFERENCES porque esta tabla
-- todavia no existia en ese punto del script; el FK se agrega aca.
ALTER TABLE ventas ADD CONSTRAINT ventas_presupuesto_id_fkey
    FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id);
CREATE INDEX idx_ventas_presupuesto ON ventas (presupuesto_id) WHERE presupuesto_id IS NOT NULL;

-- Proveedores + compras (simetrico a clientes + ventas, pero al reves:
-- una compra aumenta el stock en vez de bajarlo, y si es a credito lo que
-- crece es cuanto le debemos AL proveedor, no lo que nos debe un cliente.
CREATE TABLE proveedores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    documento       TEXT,
    telefono        TEXT,
    email           TEXT,
    direccion       TEXT,
    -- Cuanto le debemos hoy a este proveedor.
    saldo           NUMERIC(14,2) NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proveedores_empresa ON proveedores (empresa_id);
CREATE INDEX idx_proveedores_nombre ON proveedores (empresa_id, lower(nombre));
CREATE INDEX idx_proveedores_documento ON proveedores (empresa_id, documento);

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY proveedores_aislamiento ON proveedores
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Ajuste de saldo de proveedor: mismo espiritu que ajustes_saldo_cliente,
-- para proveedores.saldo (deuda por pagar).
CREATE TABLE ajustes_saldo_proveedor (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    proveedor_id    UUID NOT NULL REFERENCES proveedores(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    saldo_anterior  NUMERIC(14,2) NOT NULL,
    saldo_nuevo     NUMERIC(14,2) NOT NULL,
    diferencia      NUMERIC(14,2) NOT NULL,
    motivo          TEXT NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ajustes_saldo_proveedor_empresa ON ajustes_saldo_proveedor (empresa_id);
CREATE INDEX idx_ajustes_saldo_proveedor_proveedor ON ajustes_saldo_proveedor (empresa_id, proveedor_id);

ALTER TABLE ajustes_saldo_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY ajustes_saldo_proveedor_aislamiento ON ajustes_saldo_proveedor
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- 'contado' = ya se pago (lleva compra_pagos). 'credito' = queda a deber,
-- aumenta proveedores.saldo, no lleva compra_pagos.
CREATE TYPE tipo_pago_compra AS ENUM ('contado', 'credito');

CREATE TABLE compras (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    proveedor_id    UUID NOT NULL REFERENCES proveedores(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    tipo_pago       tipo_pago_compra NOT NULL,
    -- Datos de la factura del proveedor. Quedan NULL si es una "nota
    -- comun" sin factura legal (igual que Nota Comun/Factura Legal en
    -- FlexPDV) - no es obligatorio tener factura para cargar una compra.
    numero_factura  TEXT,
    timbrado        TEXT,
    -- Fecha real de la compra (puede cargarse dias despues); creado_en
    -- sigue siendo el momento en que se registro en el sistema.
    fecha_compra    DATE NOT NULL DEFAULT CURRENT_DATE,
    total           NUMERIC(14,2) NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reutiliza forma_pago_venta: son los mismos metodos (efectivo,
-- transferencia, tarjeta), ahora describiendo como pagamos nosotros.
CREATE TABLE compra_pagos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    compra_id       UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    forma_pago      forma_pago_venta NOT NULL,
    monto           NUMERIC(14,2) NOT NULL
);

CREATE TABLE compra_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    compra_id       UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES productos(id),
    cantidad        NUMERIC(14,3) NOT NULL,
    -- precio_unitario es el costo pagado en esta compra especifica
    -- (congelado, igual que en venta_items).
    precio_unitario NUMERIC(14,2) NOT NULL,
    subtotal        NUMERIC(14,2) NOT NULL
);

CREATE INDEX idx_compras_empresa ON compras (empresa_id);
CREATE INDEX idx_compras_proveedor ON compras (empresa_id, proveedor_id);
CREATE INDEX idx_compra_pagos_empresa ON compra_pagos (empresa_id);
CREATE INDEX idx_compra_pagos_compra ON compra_pagos (compra_id);
CREATE INDEX idx_compra_items_empresa ON compra_items (empresa_id);
CREATE INDEX idx_compra_items_compra ON compra_items (compra_id);

ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY compras_aislamiento ON compras
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE POLICY compra_pagos_aislamiento ON compra_pagos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE POLICY compra_items_aislamiento ON compra_items
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Pago a proveedor: reduce proveedores.saldo, permite pagos parciales
-- (no hace falta pagar toda la deuda de una vez).
CREATE TABLE pagos_proveedor (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    proveedor_id    UUID NOT NULL REFERENCES proveedores(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    turno_id        UUID REFERENCES turnos(id),
    forma_pago      forma_pago_venta NOT NULL,
    monto           NUMERIC(14,2) NOT NULL,
    -- Fecha real del pago (puede no ser hoy, ej. se carga con atraso) y el
    -- numero de recibo que dio el proveedor al recibir la plata - ambos
    -- opcionales para no trabar la carga si todavia no se tienen a mano.
    fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
    numero_recibo   TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagos_proveedor_empresa ON pagos_proveedor (empresa_id);
CREATE INDEX idx_pagos_proveedor_proveedor ON pagos_proveedor (empresa_id, proveedor_id);

ALTER TABLE pagos_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY pagos_proveedor_aislamiento ON pagos_proveedor
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Cobro a cliente: recibo con numeracion correlativa, permite pago
-- parcial, y un mismo cobro se reparte automaticamente entre varias
-- ventas a credito (facturas) de ese cliente, de la mas vencida a la mas
-- nueva (ver cobro_aplicaciones).
CREATE TABLE cobros (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id      UUID NOT NULL REFERENCES clientes(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    turno_id        UUID REFERENCES turnos(id),
    numero_recibo   INTEGER NOT NULL,
    monto           NUMERIC(14,2) NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero_recibo)
);

CREATE TABLE cobro_pagos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cobro_id        UUID NOT NULL REFERENCES cobros(id) ON DELETE CASCADE,
    forma_pago      forma_pago_venta NOT NULL,
    monto           NUMERIC(14,2) NOT NULL
);

-- Detalle de a que venta(s) se aplico cada cobro y por cuanto.
CREATE TABLE cobro_aplicaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cobro_id        UUID NOT NULL REFERENCES cobros(id) ON DELETE CASCADE,
    venta_id        UUID NOT NULL REFERENCES ventas(id),
    monto_aplicado  NUMERIC(14,2) NOT NULL
);

CREATE INDEX idx_cobros_empresa ON cobros (empresa_id);
CREATE INDEX idx_cobros_cliente ON cobros (empresa_id, cliente_id);
CREATE INDEX idx_cobro_pagos_empresa ON cobro_pagos (empresa_id);
CREATE INDEX idx_cobro_pagos_cobro ON cobro_pagos (cobro_id);
CREATE INDEX idx_cobro_aplicaciones_empresa ON cobro_aplicaciones (empresa_id);
CREATE INDEX idx_cobro_aplicaciones_cobro ON cobro_aplicaciones (cobro_id);
CREATE INDEX idx_cobro_aplicaciones_venta ON cobro_aplicaciones (venta_id);

ALTER TABLE cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobro_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobro_aplicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY cobros_aislamiento ON cobros
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE POLICY cobro_pagos_aislamiento ON cobro_pagos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE POLICY cobro_aplicaciones_aislamiento ON cobro_aplicaciones
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- =====================================================================
-- Plataforma: administracion de EMPREMAS por su dueno (Mario), NO de un
-- tenant puntual. Sin RLS - estas tablas no son datos de ningun cliente,
-- y solo las toca el panel de admin (login completamente separado del
-- de usuarios/tenants, ver autenticarAdmin.js).
-- =====================================================================

CREATE TABLE admins_plataforma (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historial de pagos que un cliente (empresa) le hace a EMPREMAS. Se
-- carga a mano por ahora (Mario registra cuando le pagan) - el modelo
-- queda listo para que mas adelante un cobro automatico por QR inserte
-- filas aca tambien, sin cambiar la forma de la tabla.
CREATE TABLE pagos_plataforma (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    admin_id        UUID NOT NULL REFERENCES admins_plataforma(id),
    monto           NUMERIC(14,2) NOT NULL,
    fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
    periodo_desde   DATE NOT NULL,
    periodo_hasta   DATE NOT NULL,
    notas           TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuracion global de la plataforma (una sola fila siempre). Hoy solo
-- el numero de soporte de EMPREMAS (no del comercio cliente), mostrado en
-- el boton flotante de WhatsApp y en el login - editable desde el panel
-- de super-admin sin tocar codigo.
CREATE TABLE configuracion_plataforma (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_soporte    TEXT,
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Novedades que Mario publica para avisar mejoras/funciones nuevas/
-- correcciones a todos los negocios de la plataforma a la vez. Contenido
-- global (no de un tenant) - sin empresa_id, sin RLS, mismo criterio que
-- el resto de esta seccion.
CREATE TYPE categoria_novedad AS ENUM ('nueva_funcion', 'mejora', 'correccion');

CREATE TABLE novedades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo          TEXT NOT NULL,
    descripcion     TEXT NOT NULL,
    categoria       categoria_novedad NOT NULL,
    admin_id        UUID NOT NULL REFERENCES admins_plataforma(id),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Que novedad ya leyo cada usuario puntual (no cada empresa - una misma
-- empresa puede tener dueño, encargado y varios cajeros, y que uno la lea
-- no le tiene que ocultar el aviso a los demas). Lleva empresa_id ademas
-- de usuario_id para mantener el mismo patron de aislamiento por RLS que
-- el resto del schema, aunque usuario_id ya sea unico en toda la
-- plataforma. UNIQUE(novedad_id, usuario_id) habilita el upsert al marcar
-- como leida.
CREATE TABLE novedades_leidas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    novedad_id      UUID NOT NULL REFERENCES novedades(id) ON DELETE CASCADE,
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    leido_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (novedad_id, usuario_id)
);
CREATE INDEX idx_novedades_leidas_empresa ON novedades_leidas (empresa_id);
ALTER TABLE novedades_leidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY novedades_leidas_aislamiento ON novedades_leidas
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- =====================================================================
-- Facturacion electronica (SIFEN via Sifende). Fase 1: solo Factura
-- Electronica - Sifende todavia no tiene lista la Nota de Remision.
-- =====================================================================

CREATE TYPE tipo_documento_electronico AS ENUM ('factura_electronica');
CREATE TYPE estado_documento_electronico AS ENUM
    ('pendiente', 'en_lote', 'enviado', 'aprobado', 'rechazado', 'error');

-- Un documento electronico por venta (por eso UNIQUE (venta_id)) en esta
-- fase. La venta se registra igual aunque Sifende falle/este caido -
-- queda en estado 'error' con el motivo, reintentable despues (ver
-- POST /api/ventas/:id/reintentar-sifen) en vez de perderse.
CREATE TABLE documentos_electronicos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    venta_id            UUID NOT NULL REFERENCES ventas(id),
    tipo                tipo_documento_electronico NOT NULL DEFAULT 'factura_electronica',
    estado              estado_documento_electronico NOT NULL DEFAULT 'pendiente',
    cdc                 TEXT,
    numero_formateado   TEXT,
    mensaje_error       TEXT,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (venta_id)
);

CREATE INDEX idx_documentos_electronicos_empresa ON documentos_electronicos (empresa_id);

ALTER TABLE documentos_electronicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY documentos_electronicos_aislamiento ON documentos_electronicos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE INDEX idx_pagos_plataforma_empresa ON pagos_plataforma (empresa_id);

-- =====================================================================
-- Gastos del negocio y balance mensual. Modulo dueno-only (rentabilidad
-- es mas sensible que liquidez): resultado_operativo = ingresos (ventas
-- contado + cobros de fiado) - gastos operativos - mercaderia repuesta
-- (pagos_proveedor, no se duplica aca) - consumo interno - merma.
-- Prestamos e inversion en equipos se muestran aparte, sin afectar ese
-- resultado (ver obtenerBalanceMensual en gastosController.js).
-- =====================================================================

CREATE TYPE categoria_gasto AS ENUM (
    'servicios_fijos', 'software_suscripciones', 'personal',
    'vehiculo_transporte', 'equipos_inversion', 'otros'
);

-- Plantilla de gasto recurrente (agua, luz, internet, software...). No
-- hay scheduler en este proyecto - se "precarga" de forma perezosa: al
-- abrir el balance de un mes, si todavia no existe un gasto generado
-- desde esta plantilla para ese mes, se crea uno con monto_aproximado.
CREATE TABLE gastos_recurrentes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    categoria           categoria_gasto NOT NULL,
    descripcion         TEXT NOT NULL,
    monto_aproximado    NUMERIC(14,2) NOT NULL,
    activo              BOOLEAN NOT NULL DEFAULT true,
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gastos_recurrentes_empresa ON gastos_recurrentes (empresa_id);

ALTER TABLE gastos_recurrentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY gastos_recurrentes_aislamiento ON gastos_recurrentes
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Gasto puntual. 'equipos_inversion' es la unica categoria que el balance
-- mensual excluye del resultado operativo (es inversion, no gasto
-- corriente) - se muestra aparte.
CREATE TABLE gastos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    categoria           categoria_gasto NOT NULL,
    descripcion         TEXT NOT NULL,
    monto               NUMERIC(14,2) NOT NULL,
    fecha_gasto         DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Si nace de una plantilla, queda linkeado para no volver a generarlo
    -- ese mes - pero es una fila independiente y editable, no una
    -- referencia viva a la plantilla.
    recurrente_id       UUID REFERENCES gastos_recurrentes(id),
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gastos_empresa ON gastos (empresa_id);
CREATE INDEX idx_gastos_empresa_fecha ON gastos (empresa_id, fecha_gasto);

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY gastos_aislamiento ON gastos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

-- Prestamo bancario: informativo, nunca entra en el resultado operativo
-- del balance mensual (ver comentario arriba). saldo_pendiente se ajusta
-- a mano al registrar el pago de cada cuota, no hay tabla de historial
-- de pagos separada.
CREATE TABLE prestamos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    monto_recibido      NUMERIC(14,2) NOT NULL,
    saldo_pendiente     NUMERIC(14,2) NOT NULL,
    cuota_mensual       NUMERIC(14,2) NOT NULL,
    tasa_interes        NUMERIC(5,2),
    proximo_vencimiento DATE,
    activo              BOOLEAN NOT NULL DEFAULT true,
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prestamos_empresa ON prestamos (empresa_id);

ALTER TABLE prestamos ENABLE ROW LEVEL SECURITY;

CREATE POLICY prestamos_aislamiento ON prestamos
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);

CREATE TYPE motivo_salida_stock AS ENUM ('consumo_interno', 'merma_vencimiento', 'rotura_robo');

-- Baja de stock que NO es una venta: consumo interno (familia/personal se
-- lleva mercaderia) o merma (vencimiento/descomposicion/rotura/robo).
-- Se valoriza a costo (nunca a precio de venta) - costo_unitario es una
-- foto de productos.precio_costo al momento del retiro, para que un
-- cambio de costo posterior no altere reportes de meses ya cerrados.
CREATE TABLE salidas_stock (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES productos(id),
    sucursal_id     UUID NOT NULL REFERENCES sucursales(id),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id),
    motivo          motivo_salida_stock NOT NULL,
    cantidad        NUMERIC(14,3) NOT NULL,
    costo_unitario  NUMERIC(14,2) NOT NULL,
    nota            TEXT,
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_salidas_stock_empresa ON salidas_stock (empresa_id);
CREATE INDEX idx_salidas_stock_empresa_fecha ON salidas_stock (empresa_id, fecha);
CREATE INDEX idx_salidas_stock_producto ON salidas_stock (empresa_id, producto_id);

ALTER TABLE salidas_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY salidas_stock_aislamiento ON salidas_stock
    USING (empresa_id = current_setting('app.empresa_actual', true)::uuid);
