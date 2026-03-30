-- 010: Fix view tavoli per includere shape/width/height/rotation
-- e crea receipt_items se mancante

-- Ricrea la view con tutti i campi
CREATE OR REPLACE VIEW tables_with_active_order AS
SELECT t.id, t.zone_id, t.table_number, t.seats, t.pos_x, t.pos_y,
       t.status, t.created_at, t.shape, t.width, t.height, t.rotation,
       o.id AS active_order_id,
       o.total_amount AS active_order_total,
       o.created_at AS order_opened_at
FROM tables t
LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'open';

-- receipt_items per inventory KPIs (se non esiste)
CREATE TABLE IF NOT EXISTS receipt_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id  UUID REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_item_id  UUID,
    item_name   TEXT,
    barcode     TEXT,
    qty_ordered NUMERIC(10,2),
    qty_received NUMERIC(10,2),
    unit        VARCHAR(20),
    unit_cost   NUMERIC(10,2),
    batch_no    TEXT,
    expiry_date DATE,
    confirmed_by UUID REFERENCES users(id),
    confirmed_at TIMESTAMPTZ,
    notes       TEXT
);
