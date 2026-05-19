-- Sprint 8: catalogo tempi cottura per peso/porzioni.
--
-- cooking_modes JSONB shape:
--   { default: 20, per_kg: 25, standby_min: 5, notes: '...' }
-- Tutti i campi opzionali. prep_time_mins resta per backward compat
-- (uguale a default se cooking_modes assente).
--
-- Esempi Riva:
--   riso/risotto: { default: 20, start_after_first_course_min: 5 }
--   pesce griglia: { per_kg: 25 }
--   cozze impepata: { default: 3 }
--   pesce al sale (spigola): { default: 22, standby_min: 5 }

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS cooking_modes JSONB;

CREATE INDEX IF NOT EXISTS idx_menu_items_cooking_modes
  ON menu_items USING GIN (cooking_modes)
  WHERE cooking_modes IS NOT NULL;

-- Preset Riva Beach: tempi tipici per piatti di mare.
-- L'admin puo' raffinare dalla UI Menu admin dopo deploy.

-- Risotti / Riso
UPDATE menu_items SET cooking_modes = '{"default":20,"start_after_first_course_min":5,"notes":"parte dopo l antipasto"}'::jsonb
 WHERE tenant_id='00000000-0000-0000-0000-000000000001'
   AND (name ILIKE '%risotto%' OR name ILIKE '%riso%');

-- Pesce alla griglia
UPDATE menu_items SET cooking_modes = '{"per_kg":25,"default":25,"notes":"25 min/kg"}'::jsonb
 WHERE tenant_id='00000000-0000-0000-0000-000000000001'
   AND (name ILIKE '%griglia%' OR name ILIKE '%grigliato%');

-- Cozze / impepata
UPDATE menu_items SET cooking_modes = '{"default":3,"notes":"flash cooking, parte subito"}'::jsonb
 WHERE tenant_id='00000000-0000-0000-0000-000000000001'
   AND (name ILIKE '%cozze%' OR name ILIKE '%impepata%');

-- Pesce al sale / al forno
UPDATE menu_items SET cooking_modes = '{"default":22,"standby_min":5,"notes":"20-25 min + standby 5"}'::jsonb
 WHERE tenant_id='00000000-0000-0000-0000-000000000001'
   AND (name ILIKE '%al sale%' OR name ILIKE '%al forno%');

-- Frittura paranza
UPDATE menu_items SET cooking_modes = '{"default":8,"notes":"flash, parte all ultimo"}'::jsonb
 WHERE tenant_id='00000000-0000-0000-0000-000000000001'
   AND name ILIKE '%frittura%';

-- Pizza
UPDATE menu_items SET cooking_modes = '{"default":8,"oven_phase_min":4,"finishing_phase_min":2,"notes":"cottura 4-6 + finitura"}'::jsonb
 WHERE tenant_id='00000000-0000-0000-0000-000000000001'
   AND category_id IN (
     SELECT id FROM categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Pizza'
   );

-- Astice / Aragosta (cottura lunga complessa)
UPDATE menu_items SET cooking_modes = '{"default":30,"start_early_min":10,"notes":"cottura lunga, anticipare 10min"}'::jsonb
 WHERE tenant_id='00000000-0000-0000-0000-000000000001'
   AND (name ILIKE '%astice%' OR name ILIKE '%aragosta%');
