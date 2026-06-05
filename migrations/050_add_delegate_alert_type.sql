-- 050: aggiungi 'delegate_alert' al CHECK constraint di service_alerts.
-- JP 2026-06-05: bug pre-esistente Sprint 10 — serviceTimer prova ogni 30s
-- a inserire alert_type='delegate_alert' ma la constraint definita in
-- migration 011 ammette solo waiter_20min/manager_25min/beverage_alert/
-- course_next/direct_delivered. ~43 errori/24h. La catena delega rapida
-- non funziona MAI in produzione. Inoltre ogni tick fallito rollba anche
-- gli alert validi concorrenti dello stesso tenant.
--
-- Safe migration: ALTER allarga il dominio, no perdita dati, no downtime.
ALTER TABLE service_alerts DROP CONSTRAINT IF EXISTS service_alerts_alert_type_check;
ALTER TABLE service_alerts ADD CONSTRAINT service_alerts_alert_type_check
  CHECK (alert_type IN (
    'waiter_20min',
    'manager_25min',
    'beverage_alert',
    'course_next',
    'direct_delivered',
    'delegate_alert'
  ));
