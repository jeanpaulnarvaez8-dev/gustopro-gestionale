-- 009: Shape tavoli e colore zone per editor pianta locale

-- Forma e dimensioni tavolo per la pianta visuale
ALTER TABLE tables ADD COLUMN IF NOT EXISTS shape VARCHAR(10) NOT NULL DEFAULT 'circle'
    CHECK (shape IN ('circle','square','rect'));
ALTER TABLE tables ADD COLUMN IF NOT EXISTS width FLOAT NOT NULL DEFAULT 60;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS height FLOAT NOT NULL DEFAULT 60;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS rotation FLOAT NOT NULL DEFAULT 0;

-- Colore zona per distinguere visivamente le aree nella pianta
ALTER TABLE zones ADD COLUMN IF NOT EXISTS color VARCHAR(7) NOT NULL DEFAULT '#3B82F6';
-- Dimensioni area zona nella pianta (opzionale)
ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_x FLOAT NOT NULL DEFAULT 0;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_y FLOAT NOT NULL DEFAULT 0;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_w FLOAT NOT NULL DEFAULT 400;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_h FLOAT NOT NULL DEFAULT 300;
