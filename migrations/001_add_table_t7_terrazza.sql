-- Migration 001: Aggiunge tavolo T7 nella Terrazza Panoramica
-- Già eseguita manualmente il 2026-03-17, questo file serve solo per tracking
INSERT INTO tables (zone_id, table_number, seats, pos_x, pos_y)
SELECT id, 'T7', 4, 70, 20
FROM zones WHERE name ILIKE '%terrazza%'
ON CONFLICT DO NOTHING;
