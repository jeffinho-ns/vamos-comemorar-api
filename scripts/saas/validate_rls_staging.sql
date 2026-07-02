-- Validação RLS piloto (staging) — rodar como role sem BYPASSRLS
-- docker exec -i saas-staging psql -U postgres -d agilizaidb -f scripts/saas/validate_rls_staging.sql

SET search_path TO meu_backup_db, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_rls_test') THEN
    CREATE ROLE saas_rls_test LOGIN PASSWORD 'test' NOBYPASSRLS;
  END IF;
END$$;

GRANT USAGE ON SCHEMA meu_backup_db TO saas_rls_test;
GRANT SELECT ON meu_backup_db.restaurant_reservations TO saas_rls_test;

\echo '=== RLS status ==='
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'meu_backup_db' AND c.relname = 'restaurant_reservations';

\echo '=== Teste como saas_rls_test (org inexistente => 0 linhas) ==='
BEGIN;
SET LOCAL ROLE saas_rls_test;
SELECT set_config('app.current_org', '99999', true);
SELECT count(*) AS rows_org_inexistente FROM restaurant_reservations;
COMMIT;

\echo '=== Teste como saas_rls_test (org piloto => linhas) ==='
BEGIN;
SET LOCAL ROLE saas_rls_test;
SELECT set_config('app.current_org', '1', true);
SELECT count(*) AS rows_org_piloto FROM restaurant_reservations;
COMMIT;
RESET ROLE;
