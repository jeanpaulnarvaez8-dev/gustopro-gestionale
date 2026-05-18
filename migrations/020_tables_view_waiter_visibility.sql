-- Cross-visibility per camerieri: la view tables_with_active_order ora
-- include anche waiter_id + waiter_name + items_count, cosi' la UI puo'
-- mostrare "Tavolo 5 - aperto da Marco - 3 items, 12 min".
--
-- Senza queste colonne non e' possibile sapere chi sta servendo cosa
-- a livello frontend (era una query separata per ogni tavolo == N+1).

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
  -- items_count: solo item non cancellati (lo chef potrebbe ancora
  -- doverli preparare anche se 'served' — qui vogliamo il totale lordo)
  (SELECT COUNT(*)::int
     FROM order_items oi
     WHERE oi.order_id = o.id
       AND oi.status != 'cancelled'
  ) AS active_items_count
FROM tables t
LEFT JOIN orders o
  ON o.table_id = t.id
 AND o.status::text = 'open'::text
 AND o.tenant_id = t.tenant_id
LEFT JOIN users u
  ON u.id = o.waiter_id
 AND u.tenant_id = t.tenant_id;
