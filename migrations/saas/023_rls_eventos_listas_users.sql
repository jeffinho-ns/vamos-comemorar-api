-- ============================================================================
-- SaaS Multi-Tenant — 023: RLS eventos, listas, listas_convidados, users
-- Pré-requisito: backfill (scripts/saas/backfill_organization_id_events_users.js)
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'eventos',
    'listas',
    'listas_convidados',
    'users'
  ];
  policy_bypass text;
  policy_tenant text;
  orphan_count bigint;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('meu_backup_db.' || t) IS NULL THEN
      RAISE NOTICE 'tabela % inexistente — ignorando RLS 023', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM meu_backup_db.%I WHERE organization_id IS NULL',
      t
    ) INTO orphan_count;

    IF orphan_count > 0 THEN
      RAISE EXCEPTION '023 abortado: % ainda tem % linhas com organization_id NULL', t, orphan_count;
    END IF;

    policy_bypass := 'rls_bypass_' || t;
    policy_tenant := 'rls_tenant_' || t;

    EXECUTE format('ALTER TABLE meu_backup_db.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE meu_backup_db.%I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON meu_backup_db.%I', policy_bypass, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON meu_backup_db.%I', policy_tenant, t);

    EXECUTE format($pol$
      CREATE POLICY %I ON meu_backup_db.%I
        AS PERMISSIVE FOR ALL TO PUBLIC
        USING (current_setting('app.bypass_rls', true) IN ('on', '1', 'true'))
        WITH CHECK (current_setting('app.bypass_rls', true) IN ('on', '1', 'true'))
    $pol$, policy_bypass, t);

    EXECUTE format($pol$
      CREATE POLICY %I ON meu_backup_db.%I
        AS PERMISSIVE FOR ALL TO PUBLIC
        USING (
          current_setting('app.current_org', true) = ''
          OR organization_id = NULLIF(current_setting('app.current_org', true), '')::integer
        )
        WITH CHECK (
          current_setting('app.bypass_rls', true) IN ('on', '1', 'true')
          OR current_setting('app.current_org', true) = ''
          OR organization_id = NULLIF(current_setting('app.current_org', true), '')::integer
        )
    $pol$, policy_tenant, t);

    RAISE NOTICE 'RLS estrito habilitado em %', t;
  END LOOP;
END $$;
