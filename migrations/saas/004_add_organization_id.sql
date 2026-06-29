-- ============================================================================
-- SaaS Multi-Tenant — Fase 1 / 004: organization_id nas tabelas operacionais
-- ----------------------------------------------------------------------------
-- EXPAND: adiciona organization_id (NULLABLE) + índice em cada tabela
-- operacional QUE JÁ EXISTIR (to_regclass guard, pois várias tabelas são
-- criadas em runtime via ensureTables()). Não vira NOT NULL aqui — só depois
-- do backfill 100% validado (migration de Contract, fase posterior).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ⚠️ NÃO EXECUTAR EM PRODUÇÃO sem staging + backup.
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- reservas / operação
    'restaurant_reservations','restaurant_reservation_blocks',
    'restaurant_reservation_operating_hours','restaurant_reservation_policy',
    'reservas','reservas_camarote','camarotes','camarote_convidados',
    'large_reservations','birthday_reservations','waitlist','walk_ins',
    'restaurant_areas','restaurant_tables',
    'checkins','checkouts','operational_details','rooftop_conduction',
    -- listas / eventos / promoters
    'guest_lists','guests','guest_list_gifts','gift_rules',
    'executive_events','event_settings','event_items','event_seals',
    'eventos_listas','listas','listas_convidados','beneficios','hostess',
    'promoters','promoter_eventos','promoter_convidados','promoter_comissoes',
    -- permissões / auditoria
    'user_establishment_permissions','permission_audit_logs',
    'role_permission_templates','action_logs','intranet_announcements',
    -- whatsapp / IA
    'whatsapp_contacts','whatsapp_conversations','whatsapp_messages',
    'whatsapp_campaigns','whatsapp_campaign_batches','whatsapp_campaign_send_logs',
    'conversation_state','conversation_funnel_events','customer_operational_profile',
    'reservation_whatsapp_followups','agent_conversation_context','establishment_faq',
    'ai_assistant_settings','ai_external_links','ai_ice_breakers','ai_stickers',
    'ai_allowed_numbers','ai_flyers','ai_flyer_sends',
    -- cardápio
    'menu_items','cardapio_images','menu_pause_schedules',
    -- usuários
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('meu_backup_db.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE meu_backup_db.%I ADD COLUMN IF NOT EXISTS organization_id integer', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON meu_backup_db.%I (organization_id)',
                     'idx_' || t || '_org', t);
      RAISE NOTICE 'organization_id garantido em %', t;
    ELSE
      RAISE NOTICE 'tabela % nao existe — ignorada', t;
    END IF;
  END LOOP;
END $$;
