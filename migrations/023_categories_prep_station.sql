-- KDS pro splittato per postazioni: ogni categoria ha una prep_station che
-- determina in quale coda KDS finiscono i suoi items.
--
-- Stazioni:
--   NULL / 'cucina' → KDS cucina principale (default, behavior attuale)
--   'pizzeria'      → KDS dedicato pizzeria (Simone @Riva)
--   'crudi'         → KDS dedicato preparazioni a crudo (ostriche, tartare, etc)
--   'pasticceria'   → KDS dedicato dolci
--
-- Le bevande (is_beverage=true) continuano ad andare in /bar, indipendentemente
-- dalla prep_station.
--
-- Backward compat: se prep_station IS NULL, l'item finisce nel KDS principale
-- (come oggi). Niente migrazione di dati esistenti rompe il flusso attuale.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS prep_station VARCHAR(20)
  CHECK (prep_station IS NULL OR prep_station IN ('cucina','pizzeria','crudi','pasticceria'));

-- Indice parziale per query "items per stazione X"
CREATE INDEX IF NOT EXISTS idx_categories_prep_station
  ON categories (tenant_id, prep_station)
  WHERE prep_station IS NOT NULL;

-- Default mapping per Riva Beach (tenant_id specifico).
-- Per altri tenant, l'admin imposta manualmente dalla UI Menu.
UPDATE categories SET prep_station = 'crudi'
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND name = 'Antipasti di Mare';

UPDATE categories SET prep_station = 'pasticceria'
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND name = 'Dessert';

-- Le altre categorie cucina restano prep_station=NULL → vanno in KDS cucina default.
