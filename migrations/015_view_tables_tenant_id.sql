-- ============================================================
-- 015: rebuild view tables_with_active_order with tenant_id column
-- ============================================================
-- The view was created before migration 013, so it doesn't expose
-- the tenant_id column. tables.controller after Step 3b filters
-- listings by tenant_id, but the view was missing it → "column
-- tenant_id does not exist" 500 error on GET /api/tables.
--
-- This migration drops and recreates the view including tenant_id.
-- It is non-destructive: views have no data, only the SELECT shape.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS tables_with_active_order;

CREATE VIEW tables_with_active_order AS
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
    o.created_at   AS order_opened_at
FROM tables t
LEFT JOIN orders o
       ON o.table_id = t.id
      AND o.status::text = 'open'::text
      AND o.tenant_id = t.tenant_id;

COMMIT;
