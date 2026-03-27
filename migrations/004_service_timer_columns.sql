-- 004: Timer di servizio — timestamp ready_at/served_at + alert log + flag bevande
-- Applica automaticamente via auto-deploy.sh

-- Timestamp per tracking tempi di servizio
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS ready_at  TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;

-- Flag bevande sulle categorie (soglie alert diverse: 5min vs 20min)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_beverage BOOLEAN NOT NULL DEFAULT false;

-- Log alert di servizio (per evitare duplicati e tracciare postpone)
CREATE TABLE IF NOT EXISTS service_alerts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id   UUID        NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    alert_type      VARCHAR(30) NOT NULL CHECK (alert_type IN ('waiter_20min','manager_25min','beverage_alert')),
    target_user_id  UUID        REFERENCES users(id),
    postponed_until TIMESTAMPTZ,
    acknowledged    BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_item_id, alert_type)
);

-- Indici per query performanti del timer engine
CREATE INDEX IF NOT EXISTS idx_oi_ready_unserved ON order_items(ready_at) WHERE ready_at IS NOT NULL AND served_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sa_item ON service_alerts(order_item_id);
