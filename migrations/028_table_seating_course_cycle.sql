-- Sprint 4: ciclo timer sala (presa comanda + portate).
--
-- Stati tavolo:
--   free → seated (cliente accomodato, comanda NON ancora presa)
--   seated → occupied (primo ordine inviato in cucina)
--   occupied → dirty (pagamento completato)
--   dirty → free (sbarazzo+pulizia)
--
-- Timer alert (serviceTimer.js cron 30s):
--   seated > 10min senza ordine → alert presa comanda + delega
--   last_course_served_at > 20min senza item della portata successiva → alert
--   secondo servito → 20min → alert "preparare dolce"
--   dolce servito → 10min → alert "emettere conto"

-- 1. Estende status CHECK constraint per accettare 'seated'
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_status_check;
ALTER TABLE tables
  ADD CONSTRAINT tables_status_check
  CHECK (status IN ('free','seated','occupied','parked','dirty','reserved'));

-- 2. Timestamps per ciclo ordini
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS seated_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_order_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_course        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_course_served_at TIMESTAMPTZ;

-- 3. Constraint course validi (allineati con course_type su categories)
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_current_course_check;
ALTER TABLE tables
  ADD CONSTRAINT tables_current_course_check
  CHECK (current_course IS NULL OR current_course IN (
    'antipasto','primo','secondo','dolce','bevanda','contorno','altro','check_in_emissione','closed'
  ));

-- 4. Indici parziali per query timer
CREATE INDEX IF NOT EXISTS idx_tables_seated_at
  ON tables (tenant_id, seated_at) WHERE status = 'seated';
CREATE INDEX IF NOT EXISTS idx_tables_course_served
  ON tables (tenant_id, last_course_served_at) WHERE last_course_served_at IS NOT NULL;

-- 5. View aggiornata (la usa il frontend per chip + tempi)
CREATE OR REPLACE VIEW tables_with_active_order AS
SELECT
  t.id, t.tenant_id, t.zone_id, t.table_number, t.seats,
  t.pos_x, t.pos_y, t.status, t.status_changed_at, t.created_at,
  t.shape, t.width, t.height, t.rotation,
  t.seated_at, t.first_order_at, t.current_course, t.last_course_served_at,
  o.id           AS active_order_id,
  o.total_amount AS active_order_total,
  o.created_at   AS order_opened_at,
  o.waiter_id    AS active_waiter_id,
  u.name         AS active_waiter_name,
  (SELECT COUNT(*)::int FROM order_items oi
    WHERE oi.order_id = o.id AND oi.status != 'cancelled') AS active_items_count
FROM tables t
LEFT JOIN orders o ON o.table_id = t.id AND o.status::text = 'open'::text AND o.tenant_id = t.tenant_id
LEFT JOIN users u  ON u.id = o.waiter_id AND u.tenant_id = t.tenant_id;
