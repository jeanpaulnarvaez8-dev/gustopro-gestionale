-- 1. Estende order_items.status per accettare 'oven_done' (fase intermedia
--    pizza cottura→finitura→ready). Era bloccato da CHECK constraint legacy.
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_status_check
  CHECK (status IN ('pending', 'cooking', 'oven_done', 'ready', 'served', 'cancelled'));

-- 2. Override prep_station a livello item (più granulare della categoria).
--    Es. "Antipasti di Mare" su Riva contiene MIX: Tartare/Alici (crudi)
--    + Cozze/Frittura/Polpo (cucina). Con override per item risolviamo
--    senza dover splittare la categoria.
--
-- Logica priorità nel controller KDS:
--   1. Se menu_items.prep_station IS NOT NULL → usa quello
--   2. Altrimenti usa categories.prep_station
--   3. Altrimenti default 'cucina'
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS prep_station VARCHAR(20)
  CHECK (prep_station IS NULL OR prep_station IN ('cucina','pizzeria','crudi','pasticceria'));

-- 3. Riclassifica Riva: i piatti effettivamente CRUDI restano crudi a
--    livello item, mentre la categoria "Antipasti di Mare" torna 'cucina'
--    (default per i piatti cotti).
UPDATE menu_items SET prep_station = 'crudi'
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND (name ILIKE '%tartare%'
      OR name ILIKE 'Alici Marinate'
      OR name ILIKE '%crudo%'
      OR name ILIKE 'Ostriche%');

-- 4. Aggiorna categoria: "Antipasti di Mare" → cucina (la maggioranza
--    dei piatti sono cotti, gli altri override individuale).
UPDATE categories SET prep_station = NULL  -- = cucina default
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND name = 'Antipasti di Mare';
