-- 012: Crea utente Admin con PIN 1705
INSERT INTO users (name, pin_hash, role)
VALUES ('Admin', '$2b$10$.vwu68905XyjR1FjhBLpregh9yOrKFO9V7pdsB7tGfrVm6robVy5q', 'admin')
ON CONFLICT DO NOTHING;
