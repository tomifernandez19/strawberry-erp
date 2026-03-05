CREATE TABLE IF NOT EXISTS pedidos_online (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    tiendanube_id TEXT UNIQUE,
    cliente_nombre TEXT,
    nro_pedido TEXT,
    items_raw JSONB,
    estado TEXT DEFAULT 'PENDIENTE_DESPACHO' CHECK (estado IN ('PENDIENTE_DESPACHO', 'DESPACHADO', 'CANCELADO')),
    unidad_reservada_id UUID REFERENCES unidades(id),
    medio_pago TEXT
);

-- Actualizar la tabla si ya existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pedidos_online' AND column_name='medio_pago') THEN
        ALTER TABLE pedidos_online ADD COLUMN medio_pago TEXT;
    END IF;
END $$;

-- Actualizar el estado de UNIDADES para incluir RESERVADO_ONLINE y VENDIDO_ONLINE
ALTER TABLE unidades DROP CONSTRAINT IF EXISTS unidades_estado_check;
ALTER TABLE unidades ADD CONSTRAINT unidades_estado_check CHECK (estado IN ('PENDIENTE_QR', 'DISPONIBLE', 'VENDIDO', 'RESERVADO_ONLINE', 'VENDIDO_ONLINE'));
