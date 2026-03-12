-- ============================================================
-- INVENTORY CONTROL SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  contact     VARCHAR(200),
  email       VARCHAR(200),
  notes       TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID REFERENCES suppliers(id),
  supplier_name   VARCHAR(100) NOT NULL,
  created_by      UUID REFERENCES users(id),
  expected_date   DATE,
  status          VARCHAR(20) DEFAULT 'pending', -- pending, received, partial, cancelled
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS po_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_name     VARCHAR(200) NOT NULL,
  barcode       VARCHAR(100),
  qty_ordered   DECIMAL(10,3) NOT NULL,
  unit          VARCHAR(20) DEFAULT 'kg',
  unit_cost     DECIMAL(10,2) DEFAULT 0,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID REFERENCES purchase_orders(id),
  received_by   UUID REFERENCES users(id),
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id        UUID REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id        UUID REFERENCES po_items(id),
  item_name         VARCHAR(200) NOT NULL,
  barcode           VARCHAR(100),
  qty_ordered       DECIMAL(10,3) DEFAULT 0,
  qty_received      DECIMAL(10,3) NOT NULL,
  unit              VARCHAR(20) DEFAULT 'kg',
  unit_cost         DECIMAL(10,2) DEFAULT 0,
  batch_no          VARCHAR(100),
  expiry_date       DATE,
  confirmed_by      UUID REFERENCES users(id),
  confirmed_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Computed column helper (view)
CREATE OR REPLACE VIEW receipt_items_with_discrepancy AS
SELECT
  ri.*,
  CASE WHEN ri.qty_ordered > 0
    THEN ROUND(((ri.qty_received - ri.qty_ordered) / ri.qty_ordered * 100)::NUMERIC, 2)
    ELSE 0
  END AS discrepancy_pct,
  ROUND(((ri.qty_ordered - ri.qty_received) * ri.unit_cost)::NUMERIC, 2) AS loss_value
FROM receipt_items ri;

CREATE TABLE IF NOT EXISTS spoilage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name     VARCHAR(200) NOT NULL,
  qty           DECIMAL(10,3) NOT NULL,
  unit          VARCHAR(20) DEFAULT 'kg',
  unit_cost     DECIMAL(10,2) DEFAULT 0,
  reason        VARCHAR(200),
  logged_by     UUID REFERENCES users(id),
  confirmed_by  UUID REFERENCES users(id),
  logged_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_po_items_barcode ON po_items(barcode);
CREATE INDEX IF NOT EXISTS idx_receipt_items_barcode ON receipt_items(barcode);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items(receipt_id);
