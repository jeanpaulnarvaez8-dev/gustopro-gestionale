-- 011: Sistema Workflow Comande — stati A/P/C, audit log, alert obbligatori, incroci
-- Riprogettazione completa del flusso comande sala-cucina-bar

-- ============================================================
-- 1. WORKFLOW STATUS: rinomina display_status → workflow_status
--    'waiting'    = A (Attesa/Segue) - visibile solo monitor attese
--    'production' = P (Produzione)   - visibile monitor cucina/bar
--    'delivered'  = C (Consegnato)   - solo nel conto, nessun invio
-- ============================================================

-- Aggiungi nuovo campo workflow_status
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(20)
    NOT NULL DEFAULT 'production'
    CHECK (workflow_status IN ('waiting', 'production', 'delivered'));

-- Migra dati esistenti da display_status
UPDATE order_items SET workflow_status = CASE
    WHEN display_status = 'active'    THEN 'production'
    WHEN display_status = 'waiting'   THEN 'waiting'
    WHEN display_status = 'delivered' THEN 'delivered'
    ELSE 'production'
END;

-- Timestamp: quando il cameriere ha sbloccato la voce (A → P)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
-- Timestamp: quando il cameriere ha inserito la voce
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- Chi ha inserito la voce
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS inserted_by UUID REFERENCES users(id);

-- ============================================================
-- 2. AUDIT LOG: tracciamento completo di ogni operazione
-- ============================================================
CREATE TABLE IF NOT EXISTS order_audit_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id     UUID        REFERENCES order_items(id) ON DELETE SET NULL,
    action      VARCHAR(30) NOT NULL CHECK (action IN (
        'item_insert',          -- voce inserita
        'workflow_change',      -- cambio A/P/C
        'status_change',        -- cambio pending/cooking/ready/served
        'item_delete',          -- voce cancellata (solo admin/manager)
        'alert_generated',      -- alert generato
        'alert_deferred',       -- alert rinviato
        'alert_released',       -- alert → libera (A → P)
        'direct_delivered'      -- voce inserita direttamente come C
    )),
    from_value  VARCHAR(30),
    to_value    VARCHAR(30),
    user_id     UUID        REFERENCES users(id),
    user_name   VARCHAR(255),
    metadata    JSONB,          -- dettagli extra (tempo rinvio, tavolo, prodotto, ecc)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_order   ON order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_item    ON order_audit_log(item_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON order_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON order_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON order_audit_log(created_at);

-- ============================================================
-- 3. ALERT OBBLIGATORI MIGLIORATI
-- ============================================================

-- Espandi tipi alert per il nuovo sistema
ALTER TABLE service_alerts DROP CONSTRAINT IF EXISTS service_alerts_alert_type_check;
ALTER TABLE service_alerts ADD CONSTRAINT service_alerts_alert_type_check
    CHECK (alert_type IN (
        'waiter_20min',
        'manager_25min',
        'beverage_alert',
        'course_next',          -- alert portata successiva (obbligatorio)
        'direct_delivered'      -- alert admin per consegnato diretto
    ));

-- Campi per tracking rinvii
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS defer_count   INT NOT NULL DEFAULT 0;
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS defer_history JSONB DEFAULT '[]';
-- defer_history: [{"deferred_at": "...", "minutes": 3, "user_id": "..."}]
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS is_mandatory  BOOLEAN NOT NULL DEFAULT true;
-- Link al tavolo/ordine per alert admin
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS table_number  VARCHAR(10);
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS waiter_name   VARCHAR(255);
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS item_name     VARCHAR(255);

-- Rimuovi vecchio UNIQUE e ricrea con nuovo tipo
ALTER TABLE service_alerts DROP CONSTRAINT IF EXISTS service_alerts_order_item_id_alert_type_key;
ALTER TABLE service_alerts ADD CONSTRAINT service_alerts_item_type_unique
    UNIQUE(order_item_id, alert_type);

-- ============================================================
-- 4. INDICI PER PERFORMANCE
-- ============================================================

-- Monitor attese: voci in waiting con tempo
CREATE INDEX IF NOT EXISTS idx_oi_workflow_waiting
    ON order_items(workflow_status, inserted_at)
    WHERE workflow_status = 'waiting';

-- Monitor produzione: voci in production
CREATE INDEX IF NOT EXISTS idx_oi_workflow_production
    ON order_items(workflow_status)
    WHERE workflow_status = 'production';

-- Incroci: piatti uguali in attesa/produzione
CREATE INDEX IF NOT EXISTS idx_oi_menu_item_workflow
    ON order_items(menu_item_id, workflow_status)
    WHERE workflow_status IN ('waiting', 'production') AND status NOT IN ('served', 'cancelled');

-- Alert non risolti
CREATE INDEX IF NOT EXISTS idx_sa_unresolved
    ON service_alerts(acknowledged, postponed_until)
    WHERE acknowledged = false;
