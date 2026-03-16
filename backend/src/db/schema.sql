-- ============================================================
-- GustoPro Gestionale - Complete Database Schema
-- PostgreSQL 15+ on Railway
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS & ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL,
    pin_hash   VARCHAR(60)  NOT NULL UNIQUE,
    role       VARCHAR(20)  NOT NULL CHECK (role IN ('admin','manager','waiter','kitchen','cashier')),
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. ZONES & TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS zones (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    sort_order SMALLINT     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tables (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id      UUID         NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    table_number VARCHAR(10)  NOT NULL,
    seats        SMALLINT     NOT NULL DEFAULT 2,
    pos_x        FLOAT        NOT NULL DEFAULT 10,
    pos_y        FLOAT        NOT NULL DEFAULT 10,
    status       VARCHAR(20)  NOT NULL DEFAULT 'free'
                     CHECK (status IN ('free','occupied','parked','dirty','reserved')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (zone_id, table_number)
);

-- ============================================================
-- 3. MENU
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    sort_order SMALLINT     NOT NULL DEFAULT 0,
    tax_rate   NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    is_active  BOOLEAN      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS menu_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID          NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name            VARCHAR(255)  NOT NULL,
    description     TEXT,
    base_price      NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
    is_available    BOOLEAN       NOT NULL DEFAULT true,
    prep_time_mins  SMALLINT,
    sort_order      SMALLINT      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifier_groups (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    min_selection SMALLINT     NOT NULL DEFAULT 0,
    max_selection SMALLINT     NOT NULL DEFAULT 1,
    is_required   BOOLEAN      NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS modifiers (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID          NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name        VARCHAR(100)  NOT NULL,
    price_extra NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_active   BOOLEAN       NOT NULL DEFAULT true,
    sort_order  SMALLINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_modifier_groups (
    item_id  UUID NOT NULL REFERENCES menu_items(id)      ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, group_id)
);

-- ============================================================
-- 4. ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id       UUID          NOT NULL REFERENCES tables(id)  ON DELETE RESTRICT,
    waiter_id      UUID          NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
    status         VARCHAR(20)   NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','completed','cancelled','parked')),
    payment_status VARCHAR(20)   NOT NULL DEFAULT 'unpaid'
                       CHECK (payment_status IN ('unpaid','partial','paid')),
    subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    tax_amount     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    notes          TEXT,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID          NOT NULL REFERENCES orders(id)     ON DELETE CASCADE,
    menu_item_id   UUID          NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    quantity       SMALLINT      NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price     NUMERIC(10,2) NOT NULL,
    modifier_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    subtotal       NUMERIC(10,2) NOT NULL,
    status         VARCHAR(20)   NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','cooking','ready','served','cancelled')),
    notes          TEXT,
    sent_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
    order_item_id UUID          NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id   UUID          NOT NULL REFERENCES modifiers(id)   ON DELETE RESTRICT,
    price_extra   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (order_item_id, modifier_id)
);

-- ============================================================
-- 5. PAYMENTS & RECEIPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID          NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20)   NOT NULL CHECK (payment_method IN ('cash','card','digital','room_charge')),
    processed_by   UUID          REFERENCES users(id),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID          NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    issued_by    UUID          REFERENCES users(id),
    total_amount NUMERIC(10,2) NOT NULL,
    tax_amount   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_split     BOOLEAN       NOT NULL DEFAULT false,
    split_index  SMALLINT      NOT NULL DEFAULT 1,
    split_total  SMALLINT      NOT NULL DEFAULT 1,
    receipt_data JSONB,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. VIEW: tables with active order info
-- ============================================================
CREATE OR REPLACE VIEW tables_with_active_order AS
    SELECT
        t.*,
        o.id           AS active_order_id,
        o.total_amount AS active_order_total,
        o.created_at   AS order_opened_at
    FROM tables t
    LEFT JOIN orders o
        ON o.table_id = t.id
       AND o.status   = 'open';

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Auto-recalculate order total when items change
CREATE OR REPLACE FUNCTION recalculate_order_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_order_id UUID;
BEGIN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
    UPDATE orders SET
        subtotal     = (SELECT COALESCE(SUM(subtotal), 0) FROM order_items
                        WHERE order_id = v_order_id AND status != 'cancelled'),
        total_amount = (SELECT COALESCE(SUM(subtotal), 0) FROM order_items
                        WHERE order_id = v_order_id AND status != 'cancelled')
    WHERE id = v_order_id;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE TRIGGER order_items_total_sync
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION recalculate_order_total();

-- Auto-sync table status when order opens/closes
CREATE OR REPLACE FUNCTION sync_table_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
        UPDATE tables SET status = 'occupied' WHERE id = NEW.table_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('completed','cancelled') THEN
        UPDATE tables SET status = 'dirty' WHERE id = NEW.table_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER orders_sync_table_status
    AFTER INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION sync_table_status();

-- ============================================================
-- 8. CUSTOMERS & RESERVATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    phone       VARCHAR(30),
    email       VARCHAR(255),
    notes       TEXT,
    visit_count INTEGER      NOT NULL DEFAULT 0,
    last_visit  DATE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id    UUID        REFERENCES customers(id) ON DELETE SET NULL,
    customer_name  VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(30),
    table_id       UUID        REFERENCES tables(id) ON DELETE SET NULL,
    party_size     SMALLINT    NOT NULL DEFAULT 2,
    reserved_date  DATE        NOT NULL,
    reserved_time  TIME        NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('confirmed','seated','cancelled','no_show')),
    notes          TEXT,
    created_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. MENÙ FISSI (COMBO)
-- ============================================================
CREATE TABLE IF NOT EXISTS combo_menus (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255)  NOT NULL,
    price       NUMERIC(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    is_active   BOOLEAN       NOT NULL DEFAULT true,
    sort_order  SMALLINT      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS combo_courses (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    combo_id    UUID         NOT NULL REFERENCES combo_menus(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    min_choices SMALLINT     NOT NULL DEFAULT 1,
    max_choices SMALLINT     NOT NULL DEFAULT 1,
    sort_order  SMALLINT     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS combo_course_items (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        UUID          NOT NULL REFERENCES combo_courses(id) ON DELETE CASCADE,
    menu_item_id     UUID          NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    price_supplement NUMERIC(10,2) NOT NULL DEFAULT 0,
    UNIQUE(course_id, menu_item_id)
);

-- Extend order_items: combo grouping
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_menu_id    UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_menu_name  VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_selections JSONB;
ALTER TABLE order_items ALTER COLUMN menu_item_id DROP NOT NULL;

-- Extend orders: asporto support
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type     VARCHAR(20) NOT NULL DEFAULT 'table';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name  VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time    TIME;
ALTER TABLE orders ALTER COLUMN table_id DROP NOT NULL;

-- ============================================================
-- 10. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tables_zone         ON tables(zone_id);
CREATE INDEX IF NOT EXISTS idx_tables_status       ON tables(status);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_table        ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created      ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status  ON order_items(status);
CREATE INDEX IF NOT EXISTS idx_payments_order        ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date     ON reservations(reserved_date);
CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone       ON customers(phone);
