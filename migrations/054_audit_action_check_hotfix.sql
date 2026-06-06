-- 054 HOTFIX: ripristina order_audit_log.action CHECK constraint.
--
-- Bug: migration 052 ha fatto DROP del CHECK + ADD con una lista incompleta
-- (mancavano 'table_seated' tra le altre). L'ADD CONSTRAINT verifica le righe
-- esistenti e fallisce silenziosamente (psql in non-transaction mode) se anche
-- una riga viola il nuovo check. Risultato: DROP riuscito, ADD saltato, tabella
-- senza CHECK constraint sulla colonna action → qualunque stringa adesso passa.
--
-- Questo fix riallinea il vincolo includendo TUTTE le action effettivamente
-- presenti in produzione + quelle nuove introdotte:
--   - 'table_seated' (tables.controller.js, accomoda cliente al tavolo)
--   - 'transfer' (transferOrder, Codice 32)
--   - 'claim'    (claimOrder, Codice 32 inverso)
--   - 'asporto_ritirato' / 'asporto_no_show' (split flow asporto)
-- Mantenute anche le 8 originali della migration 011.

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
        'table_seated',
        'transfer',
        'claim',
        'asporto_ritirato',
        'asporto_no_show'
    ));
