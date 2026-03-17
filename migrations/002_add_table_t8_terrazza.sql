-- Migration 002: Aggiunge tavolo T8 nella Terrazza Panoramica
INSERT INTO tables (zone_id, table_number, seats, pos_x, pos_y)
SELECT id, 'T8', 4, 70, 40
FROM zones WHERE name ILIKE '%terrazza%'
ON CONFLICT DO NOTHING;
