-- JP 2026-06-03: stampa automatica sul ticket di sala (.24) per categorie
-- bevande/dessert. Quando il cameriere manda l'ordine, il backend emette un
-- print job 'auto' con gli item_ids da stampare, l'agent locale stampa.
--
-- Flag a 2 livelli (granularita' singolo piatto + fallback categoria):
--   COALESCE(mi.auto_print, c.auto_print, false)

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS auto_print BOOLEAN DEFAULT false;

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS auto_print BOOLEAN;

-- Seed per Riva Beach Salento: acque, vini, bollicine, dessert.
-- Birra alla spina via menu_items (Spina Grande / Spina Piccola).
UPDATE categories SET auto_print = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name IN ('Acqua e Soft Drink', 'Bollicine',
                'Vini al Calice', 'Vini Bianchi',
                'Vini Rosati', 'Vini Rossi',
                'Dessert e frutta');

-- Birra alla spina: solo Spina Grande / Spina Piccola, NON tutta la cat Birre
UPDATE menu_items SET auto_print = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name IN ('Spina Grande', 'Spina Piccola');
