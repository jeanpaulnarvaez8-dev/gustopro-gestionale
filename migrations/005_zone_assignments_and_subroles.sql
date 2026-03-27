-- 005: Assegnazione camerieri a zone + sotto-ruoli
-- sub_role separato da role per backward compatibility con requireRole('waiter')

-- Sotto-ruolo opzionale per camerieri
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_role VARCHAR(20)
    CHECK (sub_role IS NULL OR sub_role IN ('accompagnatore','bevandista','comi'));

-- Assegnazioni cameriere -> zona per turno giornaliero
CREATE TABLE IF NOT EXISTS zone_assignments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id    UUID        NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    shift_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID        REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, zone_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_za_date ON zone_assignments(shift_date);
CREATE INDEX IF NOT EXISTS idx_za_user ON zone_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_za_zone_date ON zone_assignments(zone_id, shift_date);
