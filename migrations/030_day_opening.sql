-- "Apertura giornata" abbinata alla chiusura esistente.
--
-- Workflow operativo:
--   1. Inizio servizio (es. ore 12:00): admin/cassa clicca "Apri giornata"
--      → record day_closures(register=NULL) con opened_at=NOW.
--   2. Fine servizio: clicca "Chiudi giornata" → riempie campi closing.
--   3. Audit completo: chi ha aperto/chiuso, quando.
--
-- Idempotent: ri-aprire la giornata aggiorna opened_at (es. apertura sbagliata
-- → si re-apre alle 12:15 vere). La chiusura preserva opened_at.
--
-- Frontend: badge sulla AdminHomePage mostra "📅 Aperta dalle HH:MM" o "Chiusa".

ALTER TABLE day_closures
  ADD COLUMN IF NOT EXISTS opened_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_by       UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS opened_by_name  VARCHAR(120);

-- closed_at e closed_by erano NOT NULL nella migration 026 → li relax,
-- cosi' un record "solo aperto" e' valido (closed_* settati solo al
-- momento della vera chiusura).
ALTER TABLE day_closures ALTER COLUMN closed_by DROP NOT NULL;
ALTER TABLE day_closures ALTER COLUMN closed_at DROP NOT NULL;

-- Indice utile per la query "giornata aperta oggi?" tenant-scoped.
CREATE INDEX IF NOT EXISTS idx_day_closures_open
  ON day_closures (tenant_id, business_date)
  WHERE opened_at IS NOT NULL;
