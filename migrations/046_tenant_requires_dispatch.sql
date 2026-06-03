-- 046_tenant_requires_dispatch.sql
-- JP 2026-06-03: flag per attivare il workflow "Comandista" su tenant.
-- Quando true, gli items kitchen partono in workflow_status='waiting'
-- (visibili solo al Comandista PIN 7500) finche' non viene premuto
-- "INIZIA TAVOLO" che li libera alle stazioni reali (frittura, antipasti,
-- primi, pizzeria). Le bevande bypassano sempre e vanno dritte al bar.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS requires_dispatch BOOLEAN NOT NULL DEFAULT false;

-- Riva Beach Salento: abilitato in produzione.
UPDATE tenants SET requires_dispatch = true
 WHERE id = '00000000-0000-0000-0000-000000000001';
