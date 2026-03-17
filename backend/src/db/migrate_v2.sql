-- ============================================================
-- GustoPro Gestionale - Migration v2
-- Allergeni + Ingredienti + Ricette + Scalamento Stock
-- ============================================================

-- ── 1. ALLERGENI su menu_items ────────────────────────────────
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS allergens JSONB NOT NULL DEFAULT '[]';

-- ── 2. INGREDIENTI (magazzino) ────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255)  NOT NULL,
    unit          VARCHAR(20)   NOT NULL DEFAULT 'kg',
    current_stock NUMERIC(10,3) NOT NULL DEFAULT 0,
    min_stock     NUMERIC(10,3) NOT NULL DEFAULT 0,
    cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
    supplier_id   UUID          REFERENCES suppliers(id) ON DELETE SET NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER ingredients_updated_at
    BEFORE UPDATE ON ingredients
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 3. RICETTE (menu_item → ingredienti con quantità per porzione) ──
CREATE TABLE IF NOT EXISTS recipes (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id  UUID          NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    ingredient_id UUID          NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity      NUMERIC(10,4) NOT NULL CHECK (quantity > 0),
    UNIQUE(menu_item_id, ingredient_id)
);

-- ── 4. MOVIMENTI STOCK (audit trail) ─────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id  UUID          NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    type           VARCHAR(20)   NOT NULL CHECK (type IN ('in','out','adjustment')),
    quantity       NUMERIC(10,3) NOT NULL,
    reference_type VARCHAR(20),
    reference_id   UUID,
    notes          TEXT,
    created_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 5. TRIGGER: scala stock quando order_item → 'served' ─────
CREATE OR REPLACE FUNCTION deduct_stock_on_serve()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'served' AND OLD.status != 'served' AND NEW.menu_item_id IS NOT NULL THEN
        UPDATE ingredients i
        SET current_stock = GREATEST(0, current_stock - (r.quantity * NEW.quantity)),
            updated_at    = NOW()
        FROM recipes r
        WHERE r.ingredient_id = i.id
          AND r.menu_item_id  = NEW.menu_item_id;

        INSERT INTO stock_movements (ingredient_id, type, quantity, reference_type, reference_id, notes)
        SELECT r.ingredient_id,
               'out',
               r.quantity * NEW.quantity,
               'order',
               NEW.order_id,
               'Scalato automaticamente: ' || NEW.id
        FROM recipes r
        WHERE r.menu_item_id = NEW.menu_item_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER order_items_deduct_stock
    AFTER UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_serve();

-- ── 6. INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item       ON recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient      ON recipes(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingr    ON stock_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_ingredients_name        ON ingredients(name);
