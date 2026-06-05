-- 049: flag goes_to_bar su categories e menu_items.
-- JP 2026-06-05: stampante BAR @ 192.168.1.21. Tutto cio' che esce dal bar
-- (cocktail, birre, vini, bollicine, caffe', digestivi, sorbetto al limone,
-- eccetera) deve stampare automaticamente sulla .21 quando il cameriere
-- manda l'ordine. L'acqua e i soft drink continuano a stampare sulla .24
-- (preconto sala) com'e' sempre stato.

-- Override su menu_items (NULL = eredita da category, true/false = forza).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS goes_to_bar BOOLEAN DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS goes_to_bar BOOLEAN DEFAULT NULL;

-- Defaults Riva Beach: tutte le bevande tranne acqua/soft drink vanno al bar.
UPDATE categories
   SET goes_to_bar = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name IN (
     'Birre',
     'Bollicine',
     'Caffè e Digestivi',
     'Cocktail e Spritz',
     'Vini Bianchi',
     'Vini Rosati',
     'Vini Rossi',
     'Vini al Calice'
   );

-- Acqua e Soft Drink restano esplicitamente NON bar (default e' false, ma
-- per chiarezza esplicita).
UPDATE categories
   SET goes_to_bar = false
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name = 'Acqua e Soft Drink';

-- Disattiva auto_print sulle categorie che ora vanno al bar (no doppia
-- stampa: prima vino → .24 preconto + cucina, ora vino → solo .21 bar).
-- L'acqua resta auto_print=true sulla .24 com'era.
UPDATE categories
   SET auto_print = false
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND goes_to_bar = true
   AND auto_print = true;
