-- ============================================================================
-- SaaS Multi-Tenant — 024: Contract users.organization_id
-- Super admins podem permanecer NULL; demais usuários exigem organization_id.
-- Pré-requisito: backfill (scripts/saas/backfill_organization_id_events_users.js)
-- Rollback: ALTER TABLE users DROP CONSTRAINT users_org_required_unless_super;
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  orphan_count bigint;
BEGIN
  IF to_regclass('meu_backup_db.users') IS NULL THEN
    RAISE NOTICE 'tabela users inexistente — ignorando 024';
    RETURN;
  END IF;

  SELECT count(*) INTO orphan_count
    FROM meu_backup_db.users
   WHERE organization_id IS NULL
     AND COALESCE(is_super_admin, FALSE) = FALSE;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION '024 abortado: % users (não super_admin) com organization_id NULL', orphan_count;
  END IF;

  ALTER TABLE meu_backup_db.users
    DROP CONSTRAINT IF EXISTS users_org_required_unless_super;

  ALTER TABLE meu_backup_db.users
    ADD CONSTRAINT users_org_required_unless_super
    CHECK (organization_id IS NOT NULL OR COALESCE(is_super_admin, FALSE) = TRUE);

  RAISE NOTICE '024: constraint users_org_required_unless_super aplicada';
END $$;
