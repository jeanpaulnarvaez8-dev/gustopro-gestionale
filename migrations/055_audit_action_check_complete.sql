-- 055: ripristina CHECK constraint completo su order_audit_log.action.
-- JP 2026-06-06: l'audit ha rilevato che la constraint era stata droppata
-- (forse durante hotfix 054 non completato). Senza CHECK qualsiasi stringa
-- entra in action → degradazione silenziosa dell'integrità audit.
-- Lista action codes inclusi tutti quelli emessi dal backend oggi:
ALTER TABLE order_audit_log DROP CONSTRAINT IF EXISTS order_audit_log_action_check;
ALTER TABLE order_audit_log ADD CONSTRAINT order_audit_log_action_check CHECK (action IN (
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
  'asporto_no_show',
  'order_table_move',
  'table_delegated',
  'order_cancel'
));
