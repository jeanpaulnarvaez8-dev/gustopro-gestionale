-- ============================================================
-- 013: Multi-tenancy foundations — Phase 1a (additive only)
-- ============================================================
-- Goal: prepare the schema to host multiple tenants without
-- changing application behavior for the existing single tenant
-- (Riva Beach Salento).
--
-- This migration is INTENTIONALLY additive:
--   * creates `tenants` table + seeds the default tenant
--   * adds `tenant_id` column to every business table, defaulted
--     to the seed tenant so existing INSERTs keep working unchanged
--   * back-fills existing rows with the seed tenant_id
--   * adds an FK + index on tenant_id
--
-- It does NOT:
--   * change any existing UNIQUE constraint (e.g. users.pin_hash)
--   * enable Row-Level Security
--   * require any application code change
--
-- Phase 1b (next migration) will:
--   * make UNIQUE constraints tenant-scoped (pin_hash, table numbers)
--   * enable RLS with policies driven by SET LOCAL app.tenant_id
--   * land alongside the Express tenant-resolver middleware
-- ============================================================

-- Run the whole migration as a single transaction so a failure
-- anywhere rolls back everything, leaving the DB in a known state.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. tenants table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         VARCHAR(50)  NOT NULL UNIQUE,
    name         VARCHAR(255) NOT NULL,
    fiscal_data  JSONB        NOT NULL DEFAULT '{}'::jsonb,
    settings     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the existing data owner. Fixed UUID so app code can
-- reference it during the transition window.
INSERT INTO tenants (id, slug, name, fiscal_data, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'riva-beach',
    'GustoPro — Riva Beach Salento',
    jsonb_build_object(
        'piva', '',
        'address', 'Riva Beach, Salento, IT',
        'currency', 'EUR',
        'timezone', 'Europe/Rome'
    ),
    jsonb_build_object(
        'receipt_prefix', 'RIVA',
        'locale', 'it-IT'
    )
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. add tenant_id to every business table ────────────────
-- Strategy: idempotent loop. Each step is no-op if already done.
DO $$
DECLARE
    default_tenant CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
    tbl TEXT;
    business_tables TEXT[] := ARRAY[
        -- Core
        'users','zones','tables','categories',
        -- Menu
        'menu_items','modifier_groups','modifiers','item_modifier_groups',
        -- Orders
        'orders','order_items','order_item_modifiers','order_audit_log',
        -- Billing
        'payments','receipts','receipt_items',
        -- CRM
        'customers','reservations',
        -- Combo
        'combo_menus','combo_courses','combo_course_items',
        -- Service / staff
        'service_alerts','zone_assignments','staff_performance_log',
        'course_served_log','course_timing_config',
        -- Inventory
        'ingredients','recipes','suppliers',
        'purchase_orders','po_items','goods_receipts',
        'spoilage_log','stock_movements'
    ];
    fk_name TEXT;
    idx_name TEXT;
BEGIN
    FOREACH tbl IN ARRAY business_tables LOOP
        -- Skip if the table itself does not exist in this DB yet
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            RAISE NOTICE '[013] skipping % (table not present)', tbl;
            CONTINUE;
        END IF;

        -- 2a. add column (nullable initially to allow back-fill)
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID',
            tbl
        );

        -- 2b. back-fill any NULL rows with the default tenant
        EXECUTE format(
            'UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL',
            tbl, default_tenant
        );

        -- 2c. set DEFAULT so future inserts that do not pass
        --     tenant_id stay backwards-compatible
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT %L',
            tbl, default_tenant
        );

        -- 2d. enforce NOT NULL now that every row has a value
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL',
            tbl
        );

        -- 2e. foreign key (idempotent via constraint name probe)
        fk_name := 'fk_' || tbl || '_tenant';
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = fk_name
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I '
                || 'FOREIGN KEY (tenant_id) REFERENCES tenants(id) '
                || 'ON DELETE RESTRICT',
                tbl, fk_name
            );
        END IF;

        -- 2f. index on tenant_id (every query will filter by it)
        idx_name := 'idx_' || tbl || '_tenant';
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)',
            idx_name, tbl
        );

        RAISE NOTICE '[013] tenant_id wired on %', tbl;
    END LOOP;
END $$;

-- ─── 3. updated_at trigger for tenants ───────────────────────
CREATE OR REPLACE FUNCTION tenants_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION tenants_set_updated_at();

-- ─── 4. sanity check ─────────────────────────────────────────
-- Fail loudly if anything is still NULL (means a back-fill missed)
DO $$
DECLARE
    tbl TEXT;
    nulls BIGINT;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name  = 'tenant_id'
    LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id IS NULL', tbl)
        INTO nulls;
        IF nulls > 0 THEN
            RAISE EXCEPTION '[013] sanity check failed: % rows have NULL tenant_id in %',
                nulls, tbl;
        END IF;
    END LOOP;
END $$;

COMMIT;
