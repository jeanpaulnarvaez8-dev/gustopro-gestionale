-- 043: grammatura minima d'ordine per piatti a peso (Fiorentina, Rombo...).
-- Il cameriere inserisce i grammi; il minimo guida/avvisa in fase d'ordine.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS min_weight_g INT;
