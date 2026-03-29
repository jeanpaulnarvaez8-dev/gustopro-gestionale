-- 008: Coperti all'apertura tavolo + piatti a peso (pesce al kg)

-- Numero persone al tavolo
ALTER TABLE orders ADD COLUMN IF NOT EXISTS covers INT NOT NULL DEFAULT 1;

-- Tipo di pricing: fisso o al kg
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(10) NOT NULL DEFAULT 'fixed'
    CHECK (pricing_type IN ('fixed','per_kg'));

-- Peso in grammi per piatti a peso variabile
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS weight_g INT;
