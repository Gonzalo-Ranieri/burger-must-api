-- ─── BURGER MUST — Schema PostgreSQL ─────────────────────────────────────
-- Ejecutar en Supabase: SQL Editor → New query → pegar y ejecutar

-- ── EXTENSIONES ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USUARIOS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,                          -- bcrypt hash
  rol        TEXT NOT NULL CHECK (rol IN ('cliente','admin','cocina')),
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usuario admin inicial (password: admin1234 — cambiar en producción)
INSERT INTO usuarios (nombre, email, password, rol) VALUES
  ('Administrador', 'admin@burgermust.com',
   '$2a$10$xK5G1QoZ3VQ7pZ2vR8mHdeKXqL9N2cY1oP0tU3wE4iF6jG7hI8kL2', 'admin'),
  ('Cocina',        'cocina@burgermust.com',
   '$2a$10$xK5G1QoZ3VQ7pZ2vR8mHdeKXqL9N2cY1oP0tU3wE4iF6jG7hI8kL2', 'cocina')
ON CONFLICT (email) DO NOTHING;

-- ── CATEGORÍAS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  orden  INT  NOT NULL DEFAULT 0
);

INSERT INTO categorias (nombre, orden) VALUES
  ('Burgers', 1), ('The Box', 2), ('Acompañamientos', 3), ('Bebidas', 4)
ON CONFLICT (nombre) DO NOTHING;

-- ── PRODUCTOS (MENÚ) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT    NOT NULL,
  descripcion  TEXT,
  precio       INT     NOT NULL CHECK (precio >= 0),    -- en pesos ARS
  categoria_id INT     NOT NULL REFERENCES categorias(id),
  badge        TEXT,                                     -- "Más pedida", etc.
  activo       BOOLEAN NOT NULL DEFAULT true,
  imagen_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO productos (nombre, descripcion, precio, categoria_id, badge) VALUES
  ('Crispy',         'Wagyu 110g · Triple cheddar · Cebolla morada · Bacon · Salsa Ember', 17300, 1, 'Más pedida'),
  ('Cheesy',         'Wagyu 110g · Triple queso cheddar',                                  16000, 1, NULL),
  ('Classic',        'Wagyu 110g · Triple cheddar · Cebolla morada · Lechuga · Tomate · Salsa Pickled', 16500, 1, NULL),
  ('The Box',        'Classic + Cheesy + Crispy · Papas fritas · 2 salsas a elección',    38000, 2, 'Para compartir'),
  ('Papas fritas',   'Papas fritas crocantes',                                             6000,  3, NULL),
  ('Aros de cebolla','Cebolla rebozada y frita',                                           6500,  3, NULL),
  ('Nuggets',        'Nuggets de pollo crujientes',                                        6500,  3, NULL),
  ('Boniatos',       'Bastones de boniato asado',                                          7500,  3, NULL),
  ('Agua',           'Agua mineral',                                                        4500,  4, NULL),
  ('Coca Cola',      '355ml',                                                               4500,  4, NULL),
  ('Coca Cola Zero', '355ml',                                                               4500,  4, NULL),
  ('Soda Estambul',  'Soda artesanal',                                                      4500,  4, NULL)
ON CONFLICT DO NOTHING;

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── PEDIDOS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
  id              SERIAL PRIMARY KEY,
  numero          TEXT NOT NULL UNIQUE,               -- "#0041"
  usuario_id      UUID REFERENCES usuarios(id),       -- NULL si es cliente sin cuenta
  nombre_cliente  TEXT,
  estado          TEXT NOT NULL DEFAULT 'nuevo'
                  CHECK (estado IN ('nuevo','en preparación','listo','entregado','cancelado')),
  modo_entrega    TEXT NOT NULL DEFAULT 'takeaway'
                  CHECK (modo_entrega IN ('takeaway','delivery')),
  modo_pago       TEXT NOT NULL DEFAULT 'efectivo'
                  CHECK (modo_pago IN ('efectivo','online')),
  total           INT  NOT NULL CHECK (total >= 0),
  mp_preference_id TEXT,                              -- MercadoPago preference
  mp_payment_id    TEXT,                              -- MercadoPago payment ID
  mp_status        TEXT,                              -- approved, pending, rejected
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Secuencia para el número de pedido
CREATE SEQUENCE IF NOT EXISTS pedido_numero_seq START 1;

-- ── ITEMS DE PEDIDO ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_items (
  id          SERIAL PRIMARY KEY,
  pedido_id   INT  NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INT  NOT NULL REFERENCES productos(id),
  nombre      TEXT NOT NULL,                          -- snapshot del nombre
  precio_unit INT  NOT NULL,                          -- snapshot del precio
  cantidad    INT  NOT NULL CHECK (cantidad > 0),
  subtotal    INT  NOT NULL
);

-- ── ÍNDICES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pedidos_estado      ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at  ON pedidos(created_at);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo    ON productos(activo);

-- ── VISTAS ─────────────────────────────────────────────────────────────────
-- Vista para el dashboard de finanzas
CREATE OR REPLACE VIEW v_ventas_diarias AS
SELECT
  DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') AS fecha,
  COUNT(*)                                                         AS cantidad_pedidos,
  SUM(total)                                                       AS ventas_total,
  ROUND(AVG(total))                                                AS ticket_promedio,
  COUNT(*) FILTER (WHERE modo_pago = 'online')                     AS pedidos_online,
  COUNT(*) FILTER (WHERE modo_pago = 'efectivo')                   AS pedidos_efectivo
FROM pedidos
WHERE estado != 'cancelado'
GROUP BY fecha
ORDER BY fecha DESC;
