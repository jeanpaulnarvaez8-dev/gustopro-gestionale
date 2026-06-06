-- 052: Split flow chiusura asporto (RITIRATO + NO_SHOW).
-- Sostituisce l'unico bottone "LIBERA" che marcava status=completed +
-- payment_status=paid senza scontrino/payment_method/audit.
--
-- Estende order_audit_log.action CHECK per coprire le due nuove azioni:
--   asporto_ritirato  → asporto consegnato al cliente con pagamento incassato
--                       (genera payments + receipts, status=completed/paid)
--   asporto_no_show   → cliente non ritira: status=cancelled, audit con motivo
--
-- Volutamente NON aggiungo 'no_show' a orders.payment_status: lo stato
-- cancellato e' gia' sufficiente per escluderlo da revenue_today (filtrato
-- su status='completed') e da covers_today (filtrato su payment_status='paid',
-- che resta 'unpaid' di default). Il segnale semantico "no_show" vive
-- nell'audit log dove serve davvero (report e ricostruzione del flusso).

ALTER TABLE order_audit_log DROP CONSTRAINT IF EXISTS order_audit_log_action_check;

ALTER TABLE order_audit_log ADD CONSTRAINT order_audit_log_action_check
    CHECK (action IN (
        'item_insert',
        'workflow_change',
        'status_change',
        'item_delete',
        'alert_generated',
        'alert_deferred',
        'alert_released',
        'direct_delivered',
        'asporto_ritirato',
        'asporto_no_show'
    ));

-- Indice mirato per il report "asporti senza scontrino" del dayClose:
-- query tipica = WHERE action='asporto_no_show' AND created_at::date = CURRENT_DATE
-- (partial index per tenere piccolo l'indice e veloce la lookup).
CREATE INDEX IF NOT EXISTS idx_audit_asporto_no_show
    ON order_audit_log (tenant_id, created_at DESC)
    WHERE action = 'asporto_no_show';
