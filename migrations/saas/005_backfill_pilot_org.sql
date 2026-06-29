-- ============================================================================
-- SaaS Multi-Tenant — Fase 1 / 005: Backfill da ORGANIZAÇÃO PILOTO (MIGRATE)
-- ----------------------------------------------------------------------------
-- O grupo atual (Highline, Seu Justino, Pracinha, Oh Fregues, Rooftop, Sítio
-- Ilha) vira a primeira `organization`. Como hoje TODOS os dados pertencem a
-- esse grupo, o backfill é direto: organization_id = <org piloto> em todas as
-- linhas existentes. Isso garante zero linhas órfãs antes de qualquer NOT NULL.
--
-- Idempotente. Roda DEPOIS de 001..004.
-- ⚠️ NÃO EXECUTAR EM PRODUÇÃO sem staging + backup + validação de isolamento.
--
-- REVISAR antes de rodar: nome/slug da org, mapeamento places<->bars e
-- a lista de e-mails de admin do cliente.
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  v_org_id INTEGER;
  v_plan_id INTEGER;
  t text;
  tables text[] := ARRAY[
    'restaurant_reservations','restaurant_reservation_blocks',
    'restaurant_reservation_operating_hours','restaurant_reservation_policy',
    'reservas','reservas_camarote','camarotes','camarote_convidados',
    'large_reservations','birthday_reservations','waitlist','walk_ins',
    'restaurant_areas','restaurant_tables',
    'checkins','checkouts','operational_details','rooftop_conduction',
    'guest_lists','guests','guest_list_gifts','gift_rules',
    'executive_events','event_settings','event_items','event_seals',
    'eventos_listas','listas','listas_convidados','beneficios','hostess',
    'promoters','promoter_eventos','promoter_convidados','promoter_comissoes',
    'user_establishment_permissions','permission_audit_logs',
    'role_permission_templates','action_logs','intranet_announcements',
    'whatsapp_contacts','whatsapp_conversations','whatsapp_messages',
    'whatsapp_campaigns','whatsapp_campaign_batches','whatsapp_campaign_send_logs',
    'conversation_state','conversation_funnel_events','customer_operational_profile',
    'reservation_whatsapp_followups','agent_conversation_context','establishment_faq',
    'ai_assistant_settings','ai_external_links','ai_ice_breakers','ai_stickers',
    'ai_allowed_numbers','ai_flyers','ai_flyer_sends',
    'menu_items','cardapio_images','menu_pause_schedules',
    'users'
  ];
BEGIN
  -- 1) Organização piloto -----------------------------------------------------
  INSERT INTO organizations (slug, name, status, saas_enabled)
  VALUES ('grupo-ideia-um', 'Grupo Ideia Um', 'active', FALSE)  -- saas_enabled=FALSE: liga só quando validado
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org_id FROM organizations WHERE slug = 'grupo-ideia-um';

  -- 2) Establishments a partir de places (entidade operacional canônica) ------
  IF to_regclass('meu_backup_db.places') IS NOT NULL THEN
    INSERT INTO establishments (organization_id, name, slug, legacy_place_id, status)
    SELECT v_org_id, p.name, p.slug, p.id, COALESCE(p.status, 'active')
      FROM places p
     WHERE NOT EXISTS (
       SELECT 1 FROM establishments e WHERE e.legacy_place_id = p.id
     );
  END IF;

  -- 2b) Mapear bars -> establishment via nome; + aliases explícitos; + bars sem place
  IF to_regclass('meu_backup_db.bars') IS NOT NULL THEN
    -- match por nome exato (normalizado)
    UPDATE establishments e
       SET legacy_bar_id = b.id
      FROM bars b
     WHERE e.legacy_bar_id IS NULL
       AND lower(trim(e.name)) = lower(trim(b.name));

    -- aliases explícitos place<->bar (nomes divergem entre as duas tabelas):
    --   place 9 (Reserva Rooftop) = bar 5  (services/whatsappReservationService.js)
    --   place 7 (HighLine)        = bar 3  ("High Line Bar")
    UPDATE establishments SET legacy_bar_id = 5 WHERE legacy_place_id = 9 AND legacy_bar_id IS NULL;
    UPDATE establishments SET legacy_bar_id = 3 WHERE legacy_place_id = 7 AND legacy_bar_id IS NULL;

    -- bars que NÃO têm place correspondente viram establishment próprio (cardápio-only, ex.: Tio Jacques)
    INSERT INTO establishments (organization_id, name, legacy_bar_id, status)
    SELECT v_org_id, b.name, b.id, 'active'
      FROM bars b
     WHERE NOT EXISTS (SELECT 1 FROM establishments e WHERE e.legacy_bar_id = b.id);
  END IF;

  -- 3) Backfill organization_id em todas as tabelas operacionais existentes ---
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('meu_backup_db.' || t) IS NOT NULL THEN
      EXECUTE format(
        'UPDATE meu_backup_db.%I SET organization_id = $1 WHERE organization_id IS NULL', t
      ) USING v_org_id;
    END IF;
  END LOOP;

  -- 4) Catálogo de módulos (idempotente) -------------------------------------
  INSERT INTO modules (key, name) VALUES
    ('reservas',  'Reservas'),
    ('checkin',   'Check-in'),
    ('cardapio',  'Cardápio'),
    ('whatsapp',  'WhatsApp/IA'),
    ('eventos',   'Eventos'),
    ('promoters', 'Promoters'),
    ('relatorios','Relatórios')
  ON CONFLICT (key) DO NOTHING;

  -- 5) Plano "full" com todos os módulos + assinatura da org piloto ----------
  INSERT INTO plans (key, name, price_cents) VALUES ('full', 'Completo', 0)
  ON CONFLICT (key) DO NOTHING;
  SELECT id INTO v_plan_id FROM plans WHERE key = 'full';

  INSERT INTO plan_modules (plan_id, module_id)
  SELECT v_plan_id, m.id FROM modules m
  ON CONFLICT DO NOTHING;

  INSERT INTO organization_modules (organization_id, module_id, is_enabled)
  SELECT v_org_id, m.id, TRUE FROM modules m
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE organization_id = v_org_id) THEN
    INSERT INTO subscriptions (organization_id, plan_id, status)
    VALUES (v_org_id, v_plan_id, 'active');
  END IF;

  -- 6) Roles de fábrica da org piloto ----------------------------------------
  INSERT INTO roles (organization_id, key, name, is_system) VALUES
    (v_org_id, 'account_admin', 'Account Admin', TRUE),
    (v_org_id, 'gerente_bar',   'Gerente do Bar', TRUE),
    (v_org_id, 'promoter',      'Promoter', TRUE),
    (v_org_id, 'hostess',       'Hostess', TRUE),
    (v_org_id, 'recepcao',      'Recepção', TRUE)
  ON CONFLICT (organization_id, key) DO NOTHING;

  RAISE NOTICE 'Backfill concluído. organization_id da piloto = %', v_org_id;
END $$;

-- ---------------------------------------------------------------------------
-- Catálogo de permissões modulo:acao (global; idempotente)
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, module, action, description) VALUES
  ('reservas:read',   'reservas',   'read',   'Ver reservas'),
  ('reservas:create', 'reservas',   'create', 'Criar reservas'),
  ('reservas:update', 'reservas',   'update', 'Editar reservas'),
  ('reservas:delete', 'reservas',   'delete', 'Excluir reservas'),
  ('checkin:read',    'checkin',    'read',   'Ver check-ins'),
  ('checkin:update',  'checkin',    'update', 'Fazer check-in/out'),
  ('cardapio:read',   'cardapio',   'read',   'Ver cardápio'),
  ('cardapio:update', 'cardapio',   'update', 'Editar cardápio'),
  ('whatsapp:read',   'whatsapp',   'read',   'Ver conversas'),
  ('whatsapp:update', 'whatsapp',   'update', 'Operar WhatsApp/IA'),
  ('eventos:read',    'eventos',    'read',   'Ver eventos'),
  ('eventos:update',  'eventos',    'update', 'Gerenciar eventos'),
  ('relatorios:read', 'relatorios', 'read',   'Ver relatórios')
ON CONFLICT (key) DO NOTHING;
