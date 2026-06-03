-- 045_sync_table_status_guard.sql
-- JP 2026-06-02: il trigger sync_table_status metteva un tavolo a 'dirty'
-- ogni volta che un ordine passava a completed/cancelled — anche se il
-- tavolo era gia' 'free' da ore. Caso reale: 25 ordini residui chiusi
-- in massa alle 02:30 → 17 tavoli puliti tornati 'dirty' la mattina.
-- Fix: il trigger ribalta 'free→dirty' solo se OLD.status='open' (cambio
-- reale) E il tavolo era 'occupied'/'seated' (non gia' libero/sporco/riservato).

CREATE OR REPLACE FUNCTION sync_table_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'open' AND NEW.table_id IS NOT NULL THEN
        UPDATE tables SET status = 'occupied'
         WHERE id = NEW.table_id
           AND status NOT IN ('occupied','seated');
    ELSIF TG_OP = 'UPDATE'
          AND NEW.status IN ('completed','cancelled')
          AND NEW.table_id IS NOT NULL
          AND OLD.status = 'open' THEN
        UPDATE tables SET status = 'dirty'
         WHERE id = NEW.table_id
           AND status IN ('occupied','seated');
    END IF;
    RETURN NEW;
END;
$$;
