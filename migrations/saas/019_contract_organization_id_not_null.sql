-- ============================================================================
-- SaaS Multi-Tenant — Contract: organization_id NOT NULL (tabelas RLS)
-- Só aplica se não houver NULLs. Rollback: ALTER COLUMN organization_id DROP NOT NULL.
-- users e whatsapp_* ficam fora (multi-org / backfill posterior).
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
  orphan_count bigint;
  col_exists boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('meu_backup_db.' || t) IS NULL THEN
      RAISE NOTICE 'tabela % inexistente — ignorando NOT NULL 019', t;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'meu_backup_db'
         AND table_name = t
         AND column_name = 'organization_id'
    ) INTO col_exists;

    IF NOT col_exists THEN
      RAISE NOTICE 'tabela % sem organization_id — ignorando', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM meu_backup_db.%I WHERE organization_id IS NULL',
      t
    ) INTO orphan_count;

    IF orphan_count > 0 THEN
      RAISE EXCEPTION '019 abortado: % tem % NULL em organization_id', t, orphan_count;
    END IF;

    EXECUTE format(
      'ALTER TABLE meu_backup_db.%I ALTER COLUMN organization_id SET NOT NULL',
      t
    );

    RAISE NOTICE 'organization_id NOT NULL em %', t;
  END LOOP;
END $$;
