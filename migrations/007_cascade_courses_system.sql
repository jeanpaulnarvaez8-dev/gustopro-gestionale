-- 007: Sistema portate a cascata con stati display per cucina
-- Ogni piatto ha un corso (antipasto/primo/secondo/dessert) e uno stato display (active/waiting/delivered)

-- Tipo di corso sulla categoria menu (determina automaticamente il corso dei piatti)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS course_type VARCHAR(20)
    CHECK (course_type IS NULL OR course_type IN ('antipasto','primo','secondo','contorno','dessert','bevanda'));

-- Stato display dell'item: cosa vede la cucina
-- 'active'    = da eseguire ORA (grassetto, grande)
-- 'waiting'   = in attesa, A (piccolo, secondario)
-- 'delivered' = già servito, c (minimo, solo riferimento)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS display_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (display_status IN ('active','waiting','delivered'));

-- Tempi standard tra portate (configurabili dall'admin)
CREATE TABLE IF NOT EXISTS course_timing_config (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    from_course     VARCHAR(20) NOT NULL,
    to_course       VARCHAR(20) NOT NULL,
    minutes         INT         NOT NULL DEFAULT 20,
    pre_alert_mins  INT         NOT NULL DEFAULT 5,
    UNIQUE(from_course, to_course)
);

-- Inserisci tempi default
INSERT INTO course_timing_config (from_course, to_course, minutes, pre_alert_mins) VALUES
    ('antipasto', 'primo',    20, 5),
    ('antipasto', 'secondo',  45, 5),
    ('antipasto', 'dessert',  70, 5),
    ('primo',     'secondo',  25, 5),
    ('primo',     'dessert',  50, 5),
    ('secondo',   'dessert',  25, 5),
    ('secondo',   'contorno',  0, 0)
ON CONFLICT (from_course, to_course) DO NOTHING;

-- Tracker: quando una portata è stata completamente servita
CREATE TABLE IF NOT EXISTS course_served_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    course_type VARCHAR(20) NOT NULL,
    served_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_id, course_type)
);

CREATE INDEX IF NOT EXISTS idx_csl_order ON course_served_log(order_id);
CREATE INDEX IF NOT EXISTS idx_oi_display ON order_items(display_status) WHERE display_status = 'waiting';
