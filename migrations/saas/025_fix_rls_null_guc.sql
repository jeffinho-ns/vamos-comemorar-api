-- ============================================================================
-- SaaS Multi-Tenant — 025: fix RLS quando GUC nunca foi definido na conexão
--
-- BUG (018/021/023): as policies usavam
--   current_setting('app.current_org', true) = ''
-- como fail-open "sem contexto de tenant". Porém, em conexão onde a variável
-- NUNCA foi setada, current_setting(..., true) retorna NULL (não ''), e
-- NULL = '' avalia como NULL => policy nega TODAS as linhas. Com FORCE RLS em
-- `users` (023), o SELECT do login retornava 0 linhas => "Usuário não
-- encontrado" para todos os usuários.
--
-- FIX: COALESCE(current_setting(...), '') nas comparações. Comportamento
-- pretendido restaurado: sem contexto => fail-open; com contexto => isolamento
-- por organization_id (inalterado).
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- lote 018
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
    'promoter_convidados',
    -- lote 021
    'menu_items',
    'cardapio_images',
    'menu_pause_schedules',
    'whatsapp_contacts',
    'whatsapp_conversations',
    'whatsapp_messages',
    'whatsapp_campaigns',
    'establishment_faq',
    -- lote 023
    'eventos',
    'listas',
    'listas_convidados',
    'users'
  ];
  policy_tenant text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('meu_backup_db.' || t) IS NULL THEN
      RAISE NOTICE 'tabela % inexistente — ignorando fix 025', t;
      CONTINUE;
    END IF;

    policy_tenant := 'rls_tenant_' || t;

    EXECUTE format('DROP POLICY IF EXISTS %I ON meu_backup_db.%I', policy_tenant, t);

    EXECUTE format($pol$
      CREATE POLICY %I ON meu_backup_db.%I
        AS PERMISSIVE FOR ALL TO PUBLIC
        USING (
          COALESCE(current_setting('app.current_org', true), '') = ''
          OR organization_id = NULLIF(current_setting('app.current_org', true), '')::integer
        )
        WITH CHECK (
          COALESCE(current_setting('app.bypass_rls', true), '') IN ('on', '1', 'true')
          OR COALESCE(current_setting('app.current_org', true), '') = ''
          OR organization_id = NULLIF(current_setting('app.current_org', true), '')::integer
        )
    $pol$, policy_tenant, t);

    RAISE NOTICE '025: policy tenant NULL-safe recriada em %', t;
  END LOOP;
END $$;
