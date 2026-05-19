-- Sprint 6: Banco Comandista. Quando lo chef impiatta e chiama il cameriere
-- al pass, traccia chi ritira cosa e quando.
--
-- pickup_confirmations: ogni record = un ritiro al pass (puo' includere
-- piu' items dello stesso ordine raggruppati per call).
--
-- method = 'qr' | 'nfc' | 'manual'
--   qr     = cameriere scansiona QR del tavolo sul device
--   nfc    = scaffolded per quando i tag fisici arriveranno
--   manual = tap manuale "Confermo ritiro"

CREATE TABLE IF NOT EXISTS pickup_confirmations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  table_id        UUID REFERENCES tables(id),
  item_ids        UUID[] NOT NULL,         -- order_items.id presi al pass
  method          VARCHAR(10) NOT NULL DEFAULT 'manual'
                  CHECK (method IN ('qr','nfc','manual')),
  picked_up_by    UUID NOT NULL REFERENCES users(id), -- cameriere
  picked_up_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  called_by       UUID REFERENCES users(id),         -- chef/comandista
  called_at       TIMESTAMPTZ                         -- quando il pass ha chiamato
);

CREATE INDEX IF NOT EXISTS idx_pickup_conf_order
  ON pickup_confirmations (order_id);
CREATE INDEX IF NOT EXISTS idx_pickup_conf_tenant_day
  ON pickup_confirmations (tenant_id, picked_up_at DESC);

-- Tabella "calls" al cameriere dal pass (lo storico delle chiamate
-- non corrispondenti a pickup gia' fatti — alert sospesi).
CREATE TABLE IF NOT EXISTS pass_calls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  called_by   UUID NOT NULL REFERENCES users(id),
  called_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pass_calls_open
  ON pass_calls (tenant_id, called_at DESC) WHERE acknowledged_at IS NULL;
