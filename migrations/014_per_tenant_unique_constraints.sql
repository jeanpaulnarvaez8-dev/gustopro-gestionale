-- ============================================================
-- 014: Per-tenant UNIQUE constraints + fix gap migration 013
-- ============================================================
-- Goal: enable two distinct tenants to coexist without UNIQUE
-- collisions (e.g. both with PIN 0000 admin), and patch the one
-- table the 013 migration missed.
--
-- Changes (all idempotent, all in a single transaction):
--   1. waiter_assignments  → add tenant_id (was forgotten in 013)
--   2. users.pin_hash UNIQUE  → UNIQUE (tenant_id, pin_hash)
--   3. tables(zone_id, table_number)  → with tenant_id prefix
--   4. course_timing_config(from_course, to_course)  → with tenant_id
--   5. waiter_assignments(waiter_id, zone_id)  → with tenant_id
--   6. drop duplicate legacy constraint on service_alerts
-- ============================================================

BEGIN;

-- ─── 1. waiter_assignments: add missing tenant_id ────────────
DO $$
DECLARE
  default_tenant CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='waiter_assignments') THEN
    EXECUTE 'ALTER TABLE waiter_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID';
    EXECUTE format('UPDATE waiter_assignments SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
    EXECUTE format('ALTER TABLE waiter_assignments ALTER COLUMN tenant_id SET DEFAULT %L', default_tenant);
    EXECUTE 'ALTER TABLE waiter_assignments ALTER COLUMN tenant_id SET NOT NULL';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waiter_assignments_tenant') THEN
      EXECUTE 'ALTER TABLE waiter_assignments ADD CONSTRAINT fk_waiter_assignments_tenant '
              'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_waiter_assignments_tenant ON waiter_assignments (tenant_id)';
    RAISE NOTICE '[014] tenant_id wired on waiter_assignments';
  END IF;
END $$;

-- ─── 2. users: PIN unique per-tenant ─────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pin_hash_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_pin_hash_key') THEN
    EXECUTE 'ALTER TABLE users ADD CONSTRAINT users_tenant_pin_hash_key UNIQUE (tenant_id, pin_hash)';
    RAISE NOTICE '[014] users.pin_hash now UNIQUE per-tenant';
  END IF;
END $$;

-- ─── 3. tables: tavoli unici per (tenant, zone, numero) ──────
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_zone_id_table_number_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tables_tenant_zone_number_key') THEN
    EXECUTE 'ALTER TABLE tables ADD CONSTRAINT tables_tenant_zone_number_key UNIQUE (tenant_id, zone_id, table_number)';
    RAISE NOTICE '[014] tables UNIQUE now per-tenant';
  END IF;
END $$;

-- ─── 4. course_timing_config: configs uniche per tenant ──────
ALTER TABLE course_timing_config DROP CONSTRAINT IF EXISTS course_timing_config_from_course_to_course_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_timing_config_tenant_pair_key') THEN
    EXECUTE 'ALTER TABLE course_timing_config ADD CONSTRAINT course_timing_config_tenant_pair_key UNIQUE (tenant_id, from_course, to_course)';
    RAISE NOTICE '[014] course_timing_config UNIQUE now per-tenant';
  END IF;
END $$;

-- ─── 5. waiter_assignments: assegnazioni per (tenant, waiter, zone) ──
ALTER TABLE waiter_assignments DROP CONSTRAINT IF EXISTS waiter_assignments_waiter_id_zone_id_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waiter_assignments_tenant_waiter_zone_key') THEN
    EXECUTE 'ALTER TABLE waiter_assignments ADD CONSTRAINT waiter_assignments_tenant_waiter_zone_key UNIQUE (tenant_id, waiter_id, zone_id)';
    RAISE NOTICE '[014] waiter_assignments UNIQUE now per-tenant';
  END IF;
END $$;

-- ─── 6. service_alerts: rimuove vincolo duplicato legacy ─────
-- pg query mostrava service_alerts_order_item_alert_type_key e
-- service_alerts_order_item_id_alert_type_key — entrambi sulle stesse
-- colonne. Il primo è il legacy; lo droppiamo.
ALTER TABLE service_alerts DROP CONSTRAINT IF EXISTS service_alerts_order_item_alert_type_key;

-- ─── Sanity check ────────────────────────────────────────────
DO $$
DECLARE
  nulls BIGINT;
BEGIN
  SELECT count(*) INTO nulls FROM waiter_assignments WHERE tenant_id IS NULL;
  IF nulls > 0 THEN
    RAISE EXCEPTION '[014] sanity check: % righe waiter_assignments con tenant_id NULL', nulls;
  END IF;
END $$;

COMMIT;
