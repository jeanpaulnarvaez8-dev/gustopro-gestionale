-- Bug: la migration 026 ha creato day_closures.closed_at TIMESTAMPTZ NOT NULL
-- DEFAULT NOW(). La 030 ha rimosso il NOT NULL ma NON il DEFAULT, quindi
-- ogni INSERT (anche openDay) settava closed_at=NOW() → is_open=false
-- subito dopo apertura.

ALTER TABLE day_closures ALTER COLUMN closed_at DROP DEFAULT;

-- Fix record esistenti dove closed_at = opened_at (sicuramente erroneo)
UPDATE day_closures
   SET closed_at = NULL, closed_by = NULL, closed_by_name = NULL
 WHERE opened_at IS NOT NULL
   AND closed_at = opened_at;
