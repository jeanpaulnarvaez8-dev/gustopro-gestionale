-- Migration 003: Aggiunge tavolo T9 nella Terrazza Panoramica
INSERT INTO tables (zone_id, table_number, seats, pos_x, pos_y)
SELECT id, 'T9', 4, 70, 60
FROM zones WHERE name ILIKE '%terrazza%'
ON CONFLICT DO NOTHING;
