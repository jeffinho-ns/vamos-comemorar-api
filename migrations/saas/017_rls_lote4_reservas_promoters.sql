-- ============================================================================
-- SaaS Multi-Tenant — Fase 2 / 017: backfill promoters + RLS lote 4
-- reservas legado, promoters, promoter_eventos, promoter_convidados
-- checkins: tabela/coluna organization_id inexistente — ignorado
-- ============================================================================

SET search_path TO meu_backup_db, public;

-- Backfill organization_id residual em promoters
UPDATE promoter_eventos pe
   SET organization_id = p.organization_id
  FROM promoters p
 WHERE pe.organization_id IS NULL
   AND pe.promoter_id = p.promoter_id
   AND p.organization_id IS NOT NULL;

UPDATE promoter_convidados pc
   SET organization_id = p.organization_id
  FROM promoters p
 WHERE pc.organization_id IS NULL
   AND pc.promoter_id = p.promoter_id
   AND p.organization_id IS NOT NULL;

UPDATE promoter_eventos pe
   SET organization_id = o.id
  FROM organizations o
 WHERE pe.organization_id IS NULL
   AND o.slug = 'grupo-ideia-um';

UPDATE promoter_convidados pc
   SET organization_id = o.id
  FROM organizations o
 WHERE pc.organization_id IS NULL
   AND o.slug = 'grupo-ideia-um';

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reservas',
    'reservas_camarote',
    'promoters',
    'promoter_eventos',
    'promoter_convidados'
  ];
  policy_bypass text;
  policy_tenant text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('meu_backup_db.' || t) IS NULL THEN
      RAISE NOTICE 'tabela % inexistente — ignorando RLS 017', t;
      CONTINUE;
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

    RAISE NOTICE 'RLS habilitado em % (lote 4)', t;
  END LOOP;
END $$;
