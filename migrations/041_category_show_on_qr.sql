-- 041: visibilita' categoria sul MENU QR cliente (indipendente da is_active).
-- Permette di mostrare nel menu cliente solo certe categorie (es. cibo + vini)
-- tenendo le altre (acqua, birre, cocktail, caffe') disponibili allo staff.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_on_qr BOOLEAN NOT NULL DEFAULT true;

-- Riva: sul menu cliente mostra cibo + pizze + vini/bollicine.
-- Nascondi le bevande non-vino (restano ordinabili dallo staff).
UPDATE categories SET show_on_qr = false
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND name IN ('Acqua e Soft Drink', 'Birre', 'Cocktail e Spritz', 'Caffè e Digestivi');
