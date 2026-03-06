-- Agregamos columnas de cliente a ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS nombre_cliente TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS telefono_cliente TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS email_cliente TEXT;

-- Agregamos columnas de cliente a pedidos_online para no perder el dato
ALTER TABLE pedidos_online ADD COLUMN IF NOT EXISTS cliente_email TEXT;
ALTER TABLE pedidos_online ADD COLUMN IF NOT EXISTS cliente_telefono TEXT;
