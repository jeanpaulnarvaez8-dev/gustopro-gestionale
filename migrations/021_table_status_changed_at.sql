-- Traccia QUANDO il tavolo e' entrato nello stato corrente.
-- Necessario per emettere alert "tavolo dirty da troppo tempo" al maitre
-- (workflow sbarazzo): cliente paga → dirty → commis pulisce entro 5min,
-- altrimenti alert escalation.

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Trigger: aggiorna status_changed_at ogni volta che cambia 'status'.
-- Usato come timer (NOW() - status_changed_at) da serviceTimer.js per
-- emettere table-cleanup-alert.

CREATE OR REPLACE FUNCTION trg_tables_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tables_status_changed_at ON tables;
CREATE TRIGGER tables_status_changed_at
  BEFORE UPDATE ON tables
  FOR EACH ROW
  EXECUTE FUNCTION trg_tables_status_changed_at();

-- Backfill: imposta status_changed_at = updated_at se presente, altrimenti
-- NOW() per i record esistenti (cosi' partono "puliti" senza alert immediato).
UPDATE tables SET status_changed_at = NOW() WHERE status_changed_at IS NULL;

-- Indice parziale per la query "tavoli in dirty da troppo tempo": il
-- serviceTimer cerca solo righe con status='dirty', cosi' evita scan
-- completo della tabella.
CREATE INDEX IF NOT EXISTS idx_tables_dirty_since
  ON tables (tenant_id, status_changed_at) WHERE status = 'dirty';

-- View aggiornata: include status_changed_at per la UI
CREATE OR REPLACE VIEW tables_with_active_order AS
SELECT
  t.id,
  t.tenant_id,
  t.zone_id,
  t.table_number,
  t.seats,
  t.pos_x,
  t.pos_y,
  t.status,
  t.status_changed_at,
  t.created_at,
  t.shape,
  t.width,
  t.height,
  t.rotation,
  o.id           AS active_order_id,
  o.total_amount AS active_order_total,
  o.created_at   AS order_opened_at,
  o.waiter_id    AS active_waiter_id,
  u.name         AS active_waiter_name,
  (SELECT COUNT(*)::int FROM order_items oi
    WHERE oi.order_id = o.id AND oi.status != 'cancelled') AS active_items_count
FROM tables t
LEFT JOIN orders o
  ON o.table_id = t.id AND o.status::text = 'open'::text AND o.tenant_id = t.tenant_id
LEFT JOIN users u
  ON u.id = o.waiter_id AND u.tenant_id = t.tenant_id;
