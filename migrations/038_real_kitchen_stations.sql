-- Stazioni cucina REALI di Riva (riunione operativa 2026-05-20):
--   frittura       → fritti, frittura di paranza
--   primi_secondi  → primi + secondi (insieme, stessa postazione)
--   antipasti      → antipasti + contorni + CRUDI (crudi insieme antipasti)
--   pizzeria       → pizza + panini (stessa postazione, pranzo→sera)
--   pasticceria    → dolci
--   (bar resta separato via is_beverage)
--
-- I CRUDI sono mostrati con gli antipasti MA mantengono pre-allerta
-- sicurezza alimentare via flag requires_preallerta (decoupled dalla
-- stazione di display).

-- 1. Estende CHECK constraint prep_station (categories + menu_items)
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_prep_station_check;
ALTER TABLE categories ADD CONSTRAINT categories_prep_station_check
  CHECK (prep_station IS NULL OR prep_station IN
    ('cucina','frittura','primi_secondi','antipasti','pizzeria','pasticceria','crudi'));

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_prep_station_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_prep_station_check
  CHECK (prep_station IS NULL OR prep_station IN
    ('cucina','frittura','primi_secondi','antipasti','pizzeria','pasticceria','crudi'));

-- 2. Flag pre-allerta sicurezza (decoupled da prep_station)
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS requires_preallerta BOOLEAN NOT NULL DEFAULT false;

-- ─── Remap categorie Riva ──────────────────────────────────────
-- Primi + Secondi (insieme)
UPDATE categories SET prep_station = 'primi_secondi'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name IN ('Primi','Primi di Mare','Secondi','Secondi di Mare');

-- Antipasti + Contorni + Antipasti di Mare (i crudi vivono qui)
UPDATE categories SET prep_station = 'antipasti'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name IN ('Antipasti','Antipasti di Mare','Contorni');

-- Pizza + (futura categoria Panini) → pizzeria
UPDATE categories SET prep_station = 'pizzeria'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name IN ('Pizza','Panini');

-- Dessert → pasticceria (gia' settato, ridondante safe)
UPDATE categories SET prep_station = 'pasticceria'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name = 'Dessert';

-- ─── Override per-item ─────────────────────────────────────────
-- Frittura di Paranza (sta in Antipasti di Mare ma va alla FRITTURA)
UPDATE menu_items SET prep_station = 'frittura'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name ILIKE '%frittura%';

-- Crudi: reset prep_station override (cosi' ereditano 'antipasti' dalla
-- categoria) + attiva pre-allerta sicurezza alimentare.
UPDATE menu_items SET prep_station = NULL, requires_preallerta = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND (name ILIKE '%tartare%' OR name ILIKE '%crudo%'
        OR name ILIKE 'Alici Marinate' OR name ILIKE 'Ostriche%');
