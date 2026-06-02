-- 044_order_items_fire_at.sql
-- JP 2026-06-01: timer auto-fire su voci IN ATTESA. Il cameriere imposta
-- fra quanti minuti il piatto deve passare automaticamente in cucina
-- (workflow_status: waiting → production). Il cron serviceTimer.tick
-- esegue il flip quando fire_at <= NOW().

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fire_at TIMESTAMPTZ;

-- Indice parziale solo sulle voci che potenzialmente scattano
-- (waiting con fire_at impostato). La scansione del cron e' velocissima
-- anche con molti order_items totali.
CREATE INDEX IF NOT EXISTS idx_order_items_fire_at_waiting
  ON order_items (fire_at)
  WHERE workflow_status = 'waiting' AND fire_at IS NOT NULL;
