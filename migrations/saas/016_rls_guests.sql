-- ============================================================================
-- SaaS Multi-Tenant — Fase 2 / 016: RLS em guests (lote 3)
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  t text := 'guests';
  policy_bypass text;
  policy_tenant text;
BEGIN
  IF to_regclass('meu_backup_db.guests') IS NULL THEN
    RAISE NOTICE 'tabela guests inexistente — ignorando RLS 016';
    RETURN;
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
        OR organization_id IS NULL
        OR organization_id = NULLIF(current_setting('app.current_org', true), '')::integer
      )
      WITH CHECK (
        current_setting('app.bypass_rls', true) IN ('on', '1', 'true')
        OR current_setting('app.current_org', true) = ''
        OR organization_id IS NULL
        OR organization_id = NULLIF(current_setting('app.current_org', true), '')::integer
      )
  $pol$, policy_tenant, t);

  RAISE NOTICE 'RLS habilitado em guests';
END $$;
