-- 017: drop duplicate indexes su order_audit_log
-- ─────────────────────────────────────────────────────────────────────
-- Audit del 2026-05-08 ha trovato 5 coppie di indici duplicati su
-- order_audit_log: stesso schema (UNICO btree, stessa colonna), nomi
-- diversi (idx_audit_X vs idx_order_audit_log_X).
--
-- Problema: ogni INSERT/UPDATE deve aggiornare TUTTI gli indici. 5
-- indici inutili = ~2x scritture sprecate sull'audit log, che e' una
-- delle tabelle a piu' alta scrittura (audit di ogni order item).
--
-- Mantieni i `idx_order_audit_log_*` (nomi piu' descrittivi, naming
-- coerente col resto dello schema) e droppa i `idx_audit_*`.
--
-- Verificato pre-drop:
--   idx_audit_action               ⇄ idx_order_audit_log_action     (action)
--   idx_audit_created              ⇄ idx_order_audit_log_created_at (created_at)
--   idx_audit_item                 ⇄ idx_order_audit_log_item_id    (item_id)
--   idx_audit_order                ⇄ idx_order_audit_log_order_id   (order_id)
--   idx_audit_user                 ⇄ idx_order_audit_log_user_id    (user_id)
--
-- DROP INDEX e' transazionale e atomic in Postgres. Nessun rischio.

DROP INDEX IF EXISTS idx_audit_action;
DROP INDEX IF EXISTS idx_audit_created;
DROP INDEX IF EXISTS idx_audit_item;
DROP INDEX IF EXISTS idx_audit_order;
DROP INDEX IF EXISTS idx_audit_user;
