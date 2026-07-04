-- ============================================================================
-- SaaS Multi-Tenant — Fase 2 / 018: policies RLS estritas (sem organization_id IS NULL)
-- Pré-requisito: 0 órfãos em todas as tabelas RLS (backfills 016/017).
-- Fail-open anônimo mantido via app.current_org = ''.
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'restaurant_reservations',
    'guest_lists',
    'guests',
    'waitlist',
    'walk_ins',
    'large_reservations',
    'birthday_reservations',
    'restaurant_reservation_blocks',
    'reservas',
    'reservas_camarote',
    'promoters',
    'promoter_eventos',
    'promoter_convidados'
  ];
  policy_bypass text;
  policy_tenant text;
  orphan_count bigint;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('meu_backup_db.' || t) IS NULL THEN
      RAISE NOTICE 'tabela % inexistente — ignorando tighten 018', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM meu_backup_db.%I WHERE organization_id IS NULL',
      t
    ) INTO orphan_count;

    IF orphan_count > 0 THEN
      RAISE EXCEPTION '018 abortado: % ainda tem % linhas com organization_id NULL', t, orphan_count;
    END IF;

    policy_bypass := 'rls_bypass_' || t;
    policy_tenant := 'rls_tenant_' || t;

    EXECUTE format('DROP POLICY IF EXISTS %I ON meu_backup_db.%I', policy_tenant, t);

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

    RAISE NOTICE 'Policy estrita aplicada em %', t;
  END LOOP;
END $$;
