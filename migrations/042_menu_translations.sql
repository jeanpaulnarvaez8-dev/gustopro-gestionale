-- 042: traduzioni menu (menu QR cliente multilingua).
-- translations = JSONB { "en": {"name":"...","description":"..."}, "de": {...}, ... }
-- Lingua di default = italiano (colonne name/description esistenti).
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
