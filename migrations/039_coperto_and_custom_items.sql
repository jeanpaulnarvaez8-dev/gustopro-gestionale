-- 039: Coperto automatico + voci a prezzo libero (cassa)
--
-- Concept condiviso: sia il "coperto" (auto, N persone * prezzo) sia le voci
-- libere aggiunte dalla cassa (qualcosa fuori menu) sono righe order_items
-- "surcharge": entrano nel TOTALE dell'ordine (il trigger recalculate_order_total
-- somma order_items.subtotal) ma NON sono piatti da cucina. Vengono inserite
-- direttamente con status='served' / workflow_status='delivered' cosi' non
-- compaiono mai sul KDS.

-- 1. Prezzo coperto per-tenant. 0.00 = disattivato (default per ogni tenant).
--    Riva Beach Salento = 2.00 €/persona.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS coperto_price NUMERIC(10,2) NOT NULL DEFAULT 0.00;
UPDATE tenants
   SET coperto_price = 2.00
 WHERE id = '00000000-0000-0000-0000-000000000001'
   AND coperto_price = 0.00;

-- 2. order_items: marca le righe surcharge + etichetta libera (coperto / voce cassa).
--    custom_name copre le righe senza menu_item_id (menu_item_id resta NULL,
--    come gia' avviene per i combo).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_surcharge BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_name  VARCHAR(120);
