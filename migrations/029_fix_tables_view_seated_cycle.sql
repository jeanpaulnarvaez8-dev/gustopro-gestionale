-- Fix: la migration 028 falliva silently nel ricreare tables_with_active_order
-- perche' CREATE OR REPLACE VIEW di Postgres NON permette inserire colonne
-- in mezzo o riordinare. La view restava la vecchia (senza seated_at etc.).
--
-- Soluzione: DROP + CREATE pulito. Niente dipendenze a cascata (la view e'
-- usata solo da tables.controller.listTables).

DROP VIEW IF EXISTS tables_with_active_order;

CREATE VIEW tables_with_active_order AS
SELECT
  t.id, t.tenant_id, t.zone_id, t.table_number, t.seats,
  t.pos_x, t.pos_y, t.status, t.created_at,
  t.shape, t.width, t.height, t.rotation,
  -- Sprint 4: ciclo timer
  t.status_changed_at,
  t.seated_at, t.first_order_at,
  t.current_course, t.last_course_served_at,
  -- Active order info (cross-visibility chip + tempi)
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
