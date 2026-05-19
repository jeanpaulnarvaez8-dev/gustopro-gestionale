-- Sprint 9: categoria "Servizio Aggiunto" con sub-voci per kit utensili.
-- Concept: NON sono piatti veri (no consumo cucina), sono "addons" che il
-- cameriere aggiunge al tavolo per pietanze che richiedono attrezzature
-- specifiche (astice = schiaccianoci, granchio = pinza, ecc).
--
-- Workflow: cameriere ordina "Linguine all'Astice" + "Servizio Astice".
-- Il "Servizio Astice" e' una voce a prezzo €0 (o nominal €0.50) che:
--   - Va alla SALA come task (non a cucina)
--   - Appare nel KDS sala come "Preparare kit astice"
--   - Il bevandista/runner porta il kit prima del piatto

INSERT INTO categories (id, tenant_id, name, sort_order, is_active, course_type, is_beverage, prep_station)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
   'Servizio Aggiunto', 99, true, 'altro', false, NULL)
ON CONFLICT DO NOTHING;

-- Le sub-voci: piatti "speciali" zero-prezzo con required_kit pre-popolato.
-- I camerieri le ordinano insieme al piatto principale.

WITH cat AS (
  SELECT id FROM categories
   WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Servizio Aggiunto'
)
INSERT INTO menu_items
  (tenant_id, category_id, name, description, base_price, is_available,
   prep_time_mins, sort_order, pricing_type, required_kit)
SELECT '00000000-0000-0000-0000-000000000001', cat.id, name, description, 0.00, true,
       2, sort_order, 'fixed', required_kit::jsonb
FROM cat, (VALUES
  ('Servizio Astice',     'Kit per astice: schiaccianoci, grembiulino, ciotola scarti, limone, salviettine', 1,
   '["schiaccianoci","grembiulino","ciotola scarti","limone","salviettine"]'),
  ('Servizio Granchio',   'Kit per granchio: pinza, tovaglietta, ciotola scarti, limone, salviettine',       2,
   '["pinza granchio","tovaglietta","ciotola scarti","limone","salviettine"]'),
  ('Servizio Granseola',  'Kit per granseola: posate dedicate, ciotola scarti, limone',                       3,
   '["posate granseola","ciotola scarti","limone","salviettine"]'),
  ('Servizio Molluschi',  'Kit per cozze/vongole: ciotola scarti, bagnasciuga, salviettine',                  4,
   '["ciotola scarti","bagnasciuga","salviettine"]'),
  ('Servizio Pesce a Spina', 'Kit per pesce intero: coltello pesce, lisca-spinatore, piatto bordo alto',     5,
   '["coltello pesce","lisca-spinatore","piatto bordo alto"]')
) AS sv(name, description, sort_order, required_kit)
ON CONFLICT DO NOTHING;
