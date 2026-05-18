-- Multi-cassa: payments.register identifica quale cassa fisica ha
-- processato il pagamento. Il piano operativo Riva prevede "due casse
-- configurate (cassa uno, cassa due)" per audit + chiusura turno.
--
-- Format string libero (cassa_1/cassa_2/cassa_bar/...) per flessibilita'.
-- Nullable per backward compat: vecchi payments restano NULL.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS register VARCHAR(32);

-- Anche le receipts memorizzano il register per audit incrociato
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS register VARCHAR(32);

-- Indice composito per query "incassi cassa X giorno Y"
CREATE INDEX IF NOT EXISTS idx_payments_register_day
  ON payments (tenant_id, register, created_at)
  WHERE register IS NOT NULL;
