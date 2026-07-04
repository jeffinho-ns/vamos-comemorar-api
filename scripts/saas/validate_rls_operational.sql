-- Validação RLS expandido (008 + 014) — staging/prod pós-migration
-- node -e "require('./config/database').query(...)" ou psql

SET search_path TO meu_backup_db, public;

\echo '=== Tabelas com RLS ==='
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'meu_backup_db'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
ORDER BY c.relname;

\echo '=== Orphans organization_id (esperado 0 nas tabelas backfilled) ==='
SELECT 'guest_lists' AS tbl, count(*) FROM guest_lists WHERE organization_id IS NULL
UNION ALL SELECT 'waitlist', count(*) FROM waitlist WHERE organization_id IS NULL
UNION ALL SELECT 'walk_ins', count(*) FROM walk_ins WHERE organization_id IS NULL
UNION ALL SELECT 'large_reservations', count(*) FROM large_reservations WHERE organization_id IS NULL
UNION ALL SELECT 'birthday_reservations', count(*) FROM birthday_reservations WHERE organization_id IS NULL
UNION ALL SELECT 'restaurant_reservation_blocks', count(*) FROM restaurant_reservation_blocks WHERE organization_id IS NULL;
