-- 018: abilita pg_stat_statements per tracking query performance
-- ─────────────────────────────────────────────────────────────────────
-- pg_stat_statements e' l'extension di Postgres per profilare le query:
-- track count, total/mean/min/max/stddev exec_time, rows, shared_blks
-- read/hit/dirty, ecc.
--
-- Prerequisito: docker-compose deve avere
--   shared_preload_libraries=pg_stat_statements
-- nei command args (gia' settato in commit precedente).
--
-- Use:
--   SELECT query, calls, total_exec_time, mean_exec_time
--   FROM pg_stat_statements
--   WHERE dbid = (SELECT oid FROM pg_database WHERE datname='gustopro')
--   ORDER BY mean_exec_time DESC LIMIT 20;
--
-- Reset: SELECT pg_stat_statements_reset();

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
