-- 019: barcode + supplier_code su ingredients
-- ─────────────────────────────────────────────────────────────────────
-- Feature richiesta dal proprietario (2026-05-15): scanner barcode in
-- inventario per carico merce veloce. Quando arriva la bolla MARR/altro
-- fornitore, il magazziniere scansiona il codice a barre sull'etichetta
-- (EAN-13, GS1-128, ecc.) e il sistema:
--   1. Cerca l'ingrediente con quel barcode → se trovato, +1 stock
--   2. Se non trovato → form rapido per crearlo (con barcode pre-popolato)
--
-- Campi aggiunti:
--   - barcode VARCHAR(64): EAN-13 (13) / GS1-128 (fino a ~48) / EAN-8 (8)
--   - supplier_code VARCHAR(64): codice articolo fornitore (es. MARR "047314")
--
-- UNIQUE per tenant: lo stesso barcode può esistere in tenant diversi
-- (tenant Riva ha "olio cucinarte 5L" con barcode 08021066427251, tenant
-- Bistrot può avere lo stesso prodotto con stesso barcode).

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS barcode       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS supplier_code VARCHAR(64);

-- Indice unique per lookup veloce (1 ingrediente per barcode per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ingredients_tenant_barcode
  ON ingredients (tenant_id, barcode)
  WHERE barcode IS NOT NULL;

-- Indice per supplier_code (multi-prodotto possibile? di solito no, ma non
-- forzo unique per flessibilità — il barcode è l'identificatore primario)
CREATE INDEX IF NOT EXISTS idx_ingredients_supplier_code
  ON ingredients (tenant_id, supplier_code)
  WHERE supplier_code IS NOT NULL;

COMMENT ON COLUMN ingredients.barcode IS
  'Codice a barre stampato sull''etichetta (EAN-13 standard, GS1-128 per lotti)';
COMMENT ON COLUMN ingredients.supplier_code IS
  'Codice articolo del fornitore (es. MARR "047314" per Gelatina Fogli Oro 1kg)';
