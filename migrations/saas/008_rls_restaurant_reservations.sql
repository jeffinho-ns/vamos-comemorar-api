-- ============================================================================
-- SaaS Multi-Tenant — Fase 2 / 008: RLS piloto em restaurant_reservations
-- ----------------------------------------------------------------------------
-- Defense-in-depth: só ativo quando a API usa SAAS_RLS_MODE=on e set_config
-- app.current_org / app.bypass_rls por request (ver tenancy/scopedQuery.js).
--
-- Sem variáveis de sessão => fail-open (comportamento legado / anônimo).
-- ⚠️ Aplicar primeiro em STAGING; rollback: DISABLE ROW LEVEL SECURITY.
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
BEGIN
  IF to_regclass('meu_backup_db.restaurant_reservations') IS NULL THEN
    RAISE NOTICE 'restaurant_reservations inexistente — ignorando RLS 008';
    RETURN;
  END IF;

  ALTER TABLE restaurant_reservations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE restaurant_reservations FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS rls_bypass_restaurant_reservations ON restaurant_reservations;
  DROP POLICY IF EXISTS rls_tenant_restaurant_reservations ON restaurant_reservations;

  -- Super admin / jobs: SET LOCAL app.bypass_rls = on
  CREATE POLICY rls_bypass_restaurant_reservations ON restaurant_reservations
    AS PERMISSIVE
    FOR ALL
    TO PUBLIC
    USING (current_setting('app.bypass_rls', true) IN ('on', '1', 'true'))
    WITH CHECK (current_setting('app.bypass_rls', true) IN ('on', '1', 'true'));

  -- Tenant: quando app.current_org definido, isola por organization_id
  CREATE POLICY rls_tenant_restaurant_reservations ON restaurant_reservations
    AS PERMISSIVE
    FOR ALL
    TO PUBLIC
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
    );

  RAISE NOTICE 'RLS habilitado em restaurant_reservations (policies bypass + tenant)';
END $$;
