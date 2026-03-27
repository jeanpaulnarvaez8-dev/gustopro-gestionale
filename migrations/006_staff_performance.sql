-- 006: Performance tracking del personale
-- Tiene traccia del punteggio giornaliero per ogni cameriere

CREATE TABLE IF NOT EXISTS staff_performance_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
    items_served    INT         NOT NULL DEFAULT 0,
    total_response_ms BIGINT   NOT NULL DEFAULT 0,
    alerts_received INT         NOT NULL DEFAULT 0,
    escalations     INT         NOT NULL DEFAULT 0,
    score           NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_spl_user_date ON staff_performance_log(user_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_spl_date ON staff_performance_log(shift_date);
