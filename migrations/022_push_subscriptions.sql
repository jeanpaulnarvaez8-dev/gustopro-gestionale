-- Web Push subscriptions: ogni device del personale registra qui il proprio
-- subscription object (endpoint + keys) ricevuto da pushManager.subscribe()
-- nel browser. Il backend usa web-push per inviare alerts anche quando
-- l'app e' in background o chiusa.
--
-- Multi-device per user: ogni cameriere puo' avere telefono + tablet, ogni
-- device ha endpoint diverso. PRIMARY KEY su endpoint (unique per device).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user      ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_tenant    ON push_subscriptions (tenant_id);
