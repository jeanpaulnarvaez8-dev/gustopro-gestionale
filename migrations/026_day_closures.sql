-- Chiusura cassa fine giornata ("Z report" non fiscale).
--
-- Ogni record rappresenta UNA chiusura di giornata: snapshot dei totali
-- per cassa + payment_method al momento della chiusura.
-- Il piano operativo richiede questo per:
--   - "Resettare la giornata" (UX: KPI tornano a 0 il giorno dopo)
--   - Audit trail di chi ha chiuso quando
--   - Riconciliazione cassa fisica vs cassa sistema (scostamenti)
--   - Conservazione storica
--
-- IMPORTANTE: la "chiusura" NON cancella dati. Gli orders/payments restano
-- in DB come historical. La query KPI 'oggi' filtra gia' per
-- CURRENT_DATE, quindi i conteggi resettano automaticamente alle 00:00.
-- Questo record serve come SIGILLO della giornata + report stampabile.

CREATE TABLE IF NOT EXISTS day_closures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,   -- giorno di servizio (Europe/Rome)
  register        VARCHAR(32),     -- null = chiusura globale, altrimenti per cassa specifica
  -- Snapshot totali calcolati a momento chiusura
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_card      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_digital   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_other     NUMERIC(12,2) NOT NULL DEFAULT 0,
  num_orders      INTEGER NOT NULL DEFAULT 0,
  num_receipts    INTEGER NOT NULL DEFAULT 0,
  num_covers      INTEGER NOT NULL DEFAULT 0,
  -- Riconciliazione fisica (opzionale, inserita dal cassiere)
  physical_cash   NUMERIC(12,2),   -- contante effettivo contato nel cassetto
  variance_cash   NUMERIC(12,2),   -- physical - total_cash (positivo=eccesso, negativo=mancante)
  -- Audit
  closed_by       UUID NOT NULL REFERENCES users(id),
  closed_by_name  VARCHAR(120),
  closed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  -- Una chiusura per (data, register) — niente duplicati
  UNIQUE (tenant_id, business_date, register)
);

CREATE INDEX IF NOT EXISTS idx_day_closures_date
  ON day_closures (tenant_id, business_date DESC);
