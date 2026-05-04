-- ============================================================
-- 016: idempotency_keys table
-- ============================================================
-- Supporto al flush della queue offline lato client. Quando il client
-- ritenta un POST con la stessa Idempotency-Key (perche' la prima
-- chiamata aveva avuto timeout o il browser era offline al primo
-- tentativo), il middleware backend recupera la risposta salvata e
-- la rispedisce SENZA ri-elaborare la mutation.
--
-- Effetti:
--   - safety: niente ordini duplicati anche se il client retrya 1000 volte
--   - idempotenza per-tenant: la stessa key in tenant diversi non fa
--     conflitto (UNIQUE composito)
--   - cleanup: TTL 7 giorni — dopo, gc periodico (DELETE cron-side)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key             VARCHAR(64)  NOT NULL,           -- UUID v4 client-generated
    method          VARCHAR(10)  NOT NULL,           -- POST/PATCH/DELETE
    path            VARCHAR(255) NOT NULL,           -- es. /orders, /orders/:id/items
    request_hash    VARCHAR(64),                     -- SHA-256 del body, opzionale
    response_status INTEGER      NOT NULL,
    response_body   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    user_id         UUID         REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT idempotency_keys_tenant_key_uniq UNIQUE (tenant_id, key)
);

-- Index per lookup veloce (tenant_id + key) — gia' coperto dal UNIQUE.
-- Index per gc TTL:
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at
    ON idempotency_keys (created_at);

COMMIT;
