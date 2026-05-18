-- Kit utensili obbligatori da portare al tavolo per piatti specifici.
-- Es. astice → schiaccianoci + grembiulino + ciotola scarti
--     granchio → schiaccianoci + tovaglietta
--     cozze → ciotola scarti + bagnasciuga
--     pesce intero → coltello da pesce + lisca-spinatore
-- Il KDS mostra il kit accanto al pulsante "Pronto" quando l'item arriva
-- al pass, cosi' il cameriere lo prepara prima di portarlo al tavolo.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS required_kit JSONB;

-- Indice GIN per query "items che richiedono X utensile" (analytics)
CREATE INDEX IF NOT EXISTS idx_menu_items_required_kit
  ON menu_items USING GIN (required_kit)
  WHERE required_kit IS NOT NULL;

-- Preset Riva Beach (tenant_id specifico) per i piatti tipici di mare:
-- ATTENZIONE: questo aggiorna solo se il piatto esiste con nome esatto.
-- L'admin puo' modificare la lista dalla UI Menu dopo deploy.
UPDATE menu_items SET required_kit = '["schiaccianoci","grembiulino","ciotola scarti"]'::jsonb
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND (name ILIKE '%astice%' OR name ILIKE '%aragosta%');

UPDATE menu_items SET required_kit = '["schiaccianoci","tovaglietta"]'::jsonb
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND name ILIKE '%granchio%';

UPDATE menu_items SET required_kit = '["ciotola scarti","bagnasciuga"]'::jsonb
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND (name ILIKE '%cozze%' OR name ILIKE '%vongole%');

UPDATE menu_items SET required_kit = '["coltello pesce","lisca-spinatore"]'::jsonb
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND (name ILIKE '%pesce intero%' OR name ILIKE '%pesce al sale%'
         OR name ILIKE '%branzino al%' OR name ILIKE '%orata al%');
