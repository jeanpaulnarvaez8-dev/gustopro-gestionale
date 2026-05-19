-- Bug: la UNIQUE(tenant_id, business_date, register) della migration 026
-- NON impedisce duplicati su (tenant, date) quando register=NULL, perche'
-- semantica SQL: NULL != NULL nelle UNIQUE constraints standard.
--
-- Risultato: ogni openDay creava un NUOVO record invece di UPSERT.
-- Fix: indice UNIQUE PARZIALE che vincola unicita' anche su NULL register
-- (= chiusura globale del giorno).

-- Cleanup duplicati: tieni il record piu' recente per ogni (tenant, date)
-- con register=NULL. Cancella gli altri.
DELETE FROM day_closures dc1
 WHERE dc1.register IS NULL
   AND EXISTS (
     SELECT 1 FROM day_closures dc2
      WHERE dc2.register IS NULL
        AND dc2.tenant_id = dc1.tenant_id
        AND dc2.business_date = dc1.business_date
        AND dc2.id != dc1.id
        AND (dc2.opened_at, dc2.id) > (dc1.opened_at, dc1.id)
   );

-- Indice UNIQUE parziale: una sola chiusura globale per (tenant, date).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_closures_global
  ON day_closures (tenant_id, business_date)
  WHERE register IS NULL;
