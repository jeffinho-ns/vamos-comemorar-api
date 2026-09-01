-- ============================================================
-- Separa Reserva Rooftop (legado, place 9 / bar 5) de
-- Reserva Pinheiros (novo cadastro operacional).
-- Temporário: ambos ativos até fechamento do Rooftop.
--
-- Após executar:
--   SELECT id, slug, name FROM places WHERE slug IN ('reserva-rooftop','reserva-pinheiros');
--   SELECT id, slug FROM bars WHERE slug IN ('reserva-rooftop','reserva-pinheiros');
-- Pinheiros: place 21, bar 18 (hardcoded em reservaEstablishmentIds / reservaEstablishments).
-- ============================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  v_org_id INTEGER;
  v_pinheiros_place_id INTEGER;
  v_pinheiros_bar_id INTEGER;
  v_pinheiros_est_id INTEGER;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'grupo-ideia-um' LIMIT 1;

  -- ---------- 1) Restaurar place 9 + bar 5 = Reserva Rooftop ----------
  UPDATE places
     SET slug = 'reserva-rooftop',
         name = 'Reserva Rooftop',
         description = 'Reserva Rooftop — gastronomia, música e vista em Jardim das Perdizes.'
   WHERE id = 9;

  UPDATE bars
     SET slug = 'reserva-rooftop',
         name = 'Reserva Rooftop'
   WHERE id = 5;

  UPDATE establishments
     SET name = 'Reserva Rooftop',
         slug = 'reserva-rooftop',
         config = COALESCE(config, '{}'::jsonb)
           || jsonb_build_object('profile', 'rooftop')
           || jsonb_build_object(
             'rules',
             COALESCE(config->'rules', '{}'::jsonb)
               || jsonb_build_object(
                 'reservations',
                 jsonb_build_object(
                   'maxDaily', 60,
                   'areaNamePrefix', 'Reserva Rooftop - ',
                   'dualShift', true,
                   'strictHours', true
                 ),
                 'cardapio', jsonb_build_object('barId', 5),
                 'events', jsonb_build_object('extendedGuestListWindow', true)
               )
           )
   WHERE legacy_place_id = 9;

  -- Áreas legadas do Rooftop
  UPDATE restaurant_areas
     SET is_active = TRUE
   WHERE name LIKE 'Reserva Rooftop - %';

  -- Horários Rooftop (giros almoço/jantar) — establishment_id operacional = 9
  INSERT INTO restaurant_reservation_operating_hours (
    establishment_id, weekday, is_open, start_time, end_time,
    second_start_time, second_end_time, updated_at
  )
  VALUES
    (9, 0, TRUE,  '12:00', '16:00', '17:00', '20:30', NOW()),
    (9, 1, FALSE, NULL,    NULL,    NULL,    NULL,    NOW()),
    (9, 2, TRUE,  '18:00', '22:30', NULL,    NULL,    NOW()),
    (9, 3, TRUE,  '18:00', '22:30', NULL,    NULL,    NOW()),
    (9, 4, TRUE,  '18:00', '22:30', NULL,    NULL,    NOW()),
    (9, 5, TRUE,  '12:00', '16:00', '17:00', '22:30', NOW()),
    (9, 6, TRUE,  '12:00', '16:00', '17:00', '22:30', NOW())
  ON CONFLICT (establishment_id, weekday) DO UPDATE SET
    is_open = EXCLUDED.is_open,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    second_start_time = EXCLUDED.second_start_time,
    second_end_time = EXCLUDED.second_end_time,
    updated_at = NOW();

  -- ---------- 2) Criar place Reserva Pinheiros (novo) ----------
  INSERT INTO places (slug, name, email, description, logo, street, number, latitude, longitude, status, visible)
  SELECT
    'reserva-pinheiros',
    'Reserva Pinheiros',
    p.email,
    'Restaurante Reserva em Pinheiros — ambientes Deck (mesas ao ar livre) e Salão (mesas, sofás e bar).',
    p.logo,
    p.street,
    p.number,
    p.latitude,
    p.longitude,
    COALESCE(p.status, 'active'),
    COALESCE(p.visible, TRUE)
  FROM places p
  WHERE p.id = 9
    AND NOT EXISTS (SELECT 1 FROM places WHERE lower(slug) = 'reserva-pinheiros');

  SELECT id INTO v_pinheiros_place_id FROM places WHERE lower(slug) = 'reserva-pinheiros' LIMIT 1;

  IF v_pinheiros_place_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar/obter place reserva-pinheiros';
  END IF;

  -- ---------- 3) Bar do Pinheiros (cardápio próprio) ----------
  INSERT INTO bars (name, slug, description, address, logoUrl, coverImageUrl)
  SELECT
    'Reserva Pinheiros',
    'reserva-pinheiros',
    'Restaurante Reserva em Pinheiros — Deck e Salão.',
    b.address,
    b.logoUrl,
    b.coverImageUrl
  FROM bars b
  WHERE b.id = 5
    AND NOT EXISTS (SELECT 1 FROM bars WHERE lower(slug) = 'reserva-pinheiros');

  SELECT id INTO v_pinheiros_bar_id FROM bars WHERE lower(slug) = 'reserva-pinheiros' LIMIT 1;

  IF v_pinheiros_bar_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar/obter bar reserva-pinheiros';
  END IF;

  -- ---------- 4) Establishment SaaS Pinheiros ----------
  IF NOT EXISTS (SELECT 1 FROM establishments WHERE legacy_place_id = v_pinheiros_place_id) THEN
    INSERT INTO establishments (organization_id, name, slug, legacy_place_id, legacy_bar_id, status, config)
    VALUES (
      v_org_id,
      'Reserva Pinheiros',
      'reserva-pinheiros',
      v_pinheiros_place_id,
      v_pinheiros_bar_id,
      'active',
      jsonb_build_object(
        'profile', 'reserva',
        'rules', jsonb_build_object(
          'reservations', jsonb_build_object(
            'maxDaily', 60,
            'areaNamePrefix', 'Reserva - ',
            'dualShift', false,
            'strictHours', true,
            'tableBlocking', 'overlap'
          ),
          'cardapio', jsonb_build_object('barId', v_pinheiros_bar_id),
          'events', jsonb_build_object('extendedGuestListWindow', false)
        )
      )
    );
  END IF;

  SELECT id INTO v_pinheiros_est_id
    FROM establishments
   WHERE legacy_place_id = v_pinheiros_place_id
   LIMIT 1;

  IF v_pinheiros_est_id IS NOT NULL THEN
    UPDATE establishments
       SET name = 'Reserva Pinheiros',
           slug = 'reserva-pinheiros',
           legacy_bar_id = v_pinheiros_bar_id,
           config = jsonb_build_object(
             'profile', 'reserva',
             'rules', jsonb_build_object(
               'reservations', jsonb_build_object(
                 'maxDaily', 60,
                 'areaNamePrefix', 'Reserva - ',
                 'dualShift', false,
                 'strictHours', true,
                 'tableBlocking', 'overlap'
               ),
               'cardapio', jsonb_build_object('barId', v_pinheiros_bar_id),
               'events', jsonb_build_object('extendedGuestListWindow', false)
             )
           )
     WHERE id = v_pinheiros_est_id;
  END IF;

  -- Demais casas: excluir áreas dos dois Reservas
  UPDATE establishments
     SET config = jsonb_set(
       COALESCE(config, '{}'::jsonb),
       '{rules,reservations,excludeAreaPrefix}',
       '"Reserva Rooftop - "'::jsonb,
       TRUE
     )
   WHERE legacy_place_id IN (1, 4, 7, 8, 10)
     AND (config->'rules'->'reservations'->>'excludeAreaPrefix') IN ('Reserva - ', 'Reserva Rooftop - ');

  -- Horários Pinheiros (restaurante, janela única)
  INSERT INTO restaurant_reservation_operating_hours (
    establishment_id, weekday, is_open, start_time, end_time,
    second_start_time, second_end_time, updated_at
  )
  VALUES
    (v_pinheiros_place_id, 0, TRUE,  '12:00', '20:30', NULL, NULL, NOW()),
    (v_pinheiros_place_id, 1, FALSE, NULL,    NULL,    NULL, NULL, NOW()),
    (v_pinheiros_place_id, 2, TRUE,  '18:00', '22:30', NULL, NULL, NOW()),
    (v_pinheiros_place_id, 3, TRUE,  '18:00', '22:30', NULL, NULL, NOW()),
    (v_pinheiros_place_id, 4, TRUE,  '18:00', '22:30', NULL, NULL, NOW()),
    (v_pinheiros_place_id, 5, TRUE,  '12:00', '22:30', NULL, NULL, NOW()),
    (v_pinheiros_place_id, 6, TRUE,  '12:00', '22:30', NULL, NULL, NOW())
  ON CONFLICT (establishment_id, weekday) DO UPDATE SET
    is_open = EXCLUDED.is_open,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    second_start_time = EXCLUDED.second_start_time,
    second_end_time = EXCLUDED.second_end_time,
    updated_at = NOW();

  -- Módulos SaaS para Pinheiros (mesmo pacote das outras casas do grupo)
  IF v_pinheiros_est_id IS NOT NULL AND to_regclass('establishment_modules') IS NOT NULL THEN
    INSERT INTO establishment_modules (establishment_id, module_id, is_enabled)
    SELECT v_pinheiros_est_id, m.id, TRUE
      FROM modules m
     WHERE m.key IN ('reservas', 'checkin', 'cardapio', 'whatsapp', 'eventos', 'promoters', 'rh_ideia')
    ON CONFLICT (establishment_id, module_id) DO UPDATE SET is_enabled = TRUE;
  END IF;

  IF to_regclass('organization_modules') IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO organization_modules (organization_id, module_id, is_enabled)
    SELECT v_org_id, m.id, TRUE
      FROM modules m
     WHERE m.key = 'rh_ideia'
    ON CONFLICT (organization_id, module_id) DO UPDATE SET is_enabled = TRUE;
  END IF;

  -- FAQs Pinheiros: copiar das entradas atuais do id 9 (conteúdo Pinheiros)
  IF to_regclass('establishment_faq') IS NOT NULL THEN
    INSERT INTO establishment_faq (establishment_id, topic, answer, is_active, created_at, updated_at)
    SELECT v_pinheiros_place_id, f.topic, f.answer, COALESCE(f.is_active, TRUE), NOW(), NOW()
      FROM establishment_faq f
     WHERE f.establishment_id = 9
       AND NOT EXISTS (
         SELECT 1 FROM establishment_faq x
          WHERE x.establishment_id = v_pinheiros_place_id AND x.topic = f.topic
       );

    UPDATE establishment_faq
       SET answer = 'Temos várias áreas no Reserva Rooftop — Corredor, LG, Gramado, Parrilha, PQ e mais. Me conta quantas pessoas são e o horário que eu vejo a disponibilidade.'
     WHERE establishment_id = 9 AND topic = 'areas';

    UPDATE establishment_faq
       SET answer = 'O Reserva Rooftop funciona com horários de almoço e jantar que variam por dia. Consulte a disponibilidade para a data desejada.'
     WHERE establishment_id = 9 AND topic = 'horario_funcionamento';

    UPDATE establishment_faq
       SET answer = 'A orientação de estacionamento no Reserva Rooftop pode variar conforme o dia e o evento. Posso confirmar com a equipe no dia da reserva.'
     WHERE establishment_id = 9 AND topic = 'estacionamento';

    UPDATE establishment_faq
       SET answer = 'O dress code no Reserva Rooftop é elegante e alinhado ao clima. Evite trajes esportivos e roupas curtas após o horário.'
     WHERE establishment_id = 9 AND topic = 'dress_code';

    UPDATE establishment_faq
       SET answer = 'O cardápio digital do Reserva Rooftop está em https://www.agilizaiapp.com.br/cardapio/reserva-rooftop'
     WHERE establishment_id = 9 AND topic = 'cardapio';
  END IF;

  RAISE NOTICE 'Reserva Rooftop restaurado: place/bar 9/5';
  RAISE NOTICE 'Reserva Pinheiros criado: place_id=%, bar_id=%, establishment_id=%',
    v_pinheiros_place_id, v_pinheiros_bar_id, v_pinheiros_est_id;
END $$;
