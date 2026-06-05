-- 051: distingue waiting "hold manuale" (cameriere tiene il piatto in attesa
-- esplicitamente senza timer) da waiting "tecnico" (forzato da
-- requires_dispatch sul Comandista).
--
-- JP 2026-06-05: se il cameriere mette un piatto in attesa SENZA tempo,
-- INIZIA TAVOLO del Comandista (e auto-fire del timer) NON devono
-- toccarlo. Solo il cameriere/Manda in cucina puo' sbloccarlo.
--
-- Default false: tutti i waiting esistenti pre-migration NON sono manual
-- hold → INIZIA TAVOLO continua a comportarsi come prima per loro.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_manual_hold BOOLEAN NOT NULL DEFAULT false;

-- Indice opzionale: query del Comandista filtra spesso su is_manual_hold.
CREATE INDEX IF NOT EXISTS idx_order_items_manual_hold
  ON order_items (tenant_id, workflow_status)
  WHERE is_manual_hold = true;
