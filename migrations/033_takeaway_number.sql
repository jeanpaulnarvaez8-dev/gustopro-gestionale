-- Sprint 7: numero progressivo asporto giornaliero (es. T101, T102, ...).
-- Stampato grosso sull'etichetta del box per identificare l'ordine al
-- ritiro. Reset automatico ogni giorno (sequence per-tenant per-data).
--
-- Implementazione: tabella counter (tenant_id, business_date, last_number)
-- + funzione next_takeaway_number() che fa UPSERT atomico.

CREATE TABLE IF NOT EXISTS takeaway_counters (
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_date  DATE NOT NULL,
  last_number    INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (tenant_id, business_date)
);

-- Aggiunge takeaway_number su orders (progressivo giornaliero asporto).
-- Nullable: niente cambia per gli ordini al tavolo.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS takeaway_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_orders_takeaway_number
  ON orders (tenant_id, takeaway_number) WHERE takeaway_number IS NOT NULL;
