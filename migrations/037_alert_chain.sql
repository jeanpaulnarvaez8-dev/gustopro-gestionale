-- Sprint 10: catena escalation alert (delegato + sostituto + admin).
--
-- users.alert_delegate_id → chi riceve alert se il primario non risponde.
-- users.is_alert_responder → utente abilitato a essere "responder" (cosi'
--   non possiamo per sbaglio delegare a un cassiere che non e' in sala).
-- users.can_serve_wine → chi puo' aprire/servire vino (separato da bar).
--
-- Catena tipica Riva:
--   - Cameriere (primario, riceve alert servizio)
--   - Delegato (Marco/Giovanni, riceve dopo 3min se primario non risponde)
--   - Sostituto / capo sala (riceve dopo altri 3min)
--   - Admin (sempre in CC su tutto)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS alert_delegate_id    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS is_alert_responder   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_serve_wine       BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_alert_responders
  ON users (tenant_id) WHERE is_active = true AND is_alert_responder = true;

CREATE INDEX IF NOT EXISTS idx_users_can_serve_wine
  ON users (tenant_id) WHERE is_active = true AND can_serve_wine = true;

-- Storico "chiamate vino": chi chiama da dove e chi risponde.
-- Pulsante dal bevandista/bar manda notify a chi ha can_serve_wine=true.

CREATE TABLE IF NOT EXISTS wine_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_id        UUID REFERENCES tables(id),
  called_by       UUID NOT NULL REFERENCES users(id),
  called_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_wine_calls_open
  ON wine_calls (tenant_id, called_at DESC) WHERE acknowledged_at IS NULL;

-- Preset Riva: admin = responder primario, plus i 4 waiter "sala"
-- diventano alert_responder (Marco / Alessio / Umberto / Francesco).
UPDATE users SET is_alert_responder = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND is_active = true
   AND (role IN ('admin','manager') OR (role='waiter' AND sub_role='sala'));

-- Chi puo' servire vino: admin + manager + camerieri sala (Marco e simili).
-- Il bevandista no, perche' nel piano operativo "bevandista" e' separato
-- dal sommelier/vino.
UPDATE users SET can_serve_wine = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND is_active = true
   AND (role IN ('admin','manager') OR (role='waiter' AND sub_role='sala'));
