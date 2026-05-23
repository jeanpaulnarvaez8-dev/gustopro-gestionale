-- 040: il timer della portata successiva (20 min) parte da quando la portata
-- e' PRONTA al pass (consegna al cameriere), non da quando viene servita.
--
-- Aggiungo last_course_ready_at: impostato da kds.controller quando TUTTI gli
-- item di una portata diventano 'ready'. serviceTimer.checkCourseCycle usa
-- questo timestamp per i 20 min verso la portata successiva.
-- (last_course_served_at resta per il promemoria conto dopo il dolce.)
ALTER TABLE tables ADD COLUMN IF NOT EXISTS last_course_ready_at TIMESTAMPTZ;
