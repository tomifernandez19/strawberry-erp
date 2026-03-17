-- Agregar columna en_vidriera a la tabla unidades
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS en_vidriera BOOLEAN DEFAULT FALSE;
