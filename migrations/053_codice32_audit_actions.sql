-- 053: Codice 32 (delega tavolo) + Codice 32 inverso (subentro).
-- Estende order_audit_log.action CHECK per coprire:
--   transfer  → Marco delega l'ordine ad Umberto (transferOrder)
--   claim     → Marco si riprende il tavolo da Umberto (claimOrder)
--
-- ATTENZIONE: 'transfer' era un BUG LATENTE — transferOrder gia' esisteva
-- in orders.controller.js e inseriva action='transfer' violando il CHECK.
-- In prod il primo Codice 32 effettivo avrebbe ritornato 500 (check_violation).
-- Questa migration sana quel bug E aggiunge 'claim' nello stesso colpo.

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
        'asporto_no_show',
        'transfer',
        'claim'
    ));
