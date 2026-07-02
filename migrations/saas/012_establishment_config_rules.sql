-- ============================================================================
-- SaaS — Fase 7 / 012: regras por estabelecimento em establishments.config
-- ============================================================================

SET search_path TO meu_backup_db, public;

UPDATE establishments SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
  'profile', 'rooftop',
  'rules', jsonb_build_object(
    'reservations', jsonb_build_object(
      'maxDaily', 60,
      'areaNamePrefix', 'Reserva Rooftop - ',
      'dualShift', true,
      'strictHours', true
    ),
    'cardapio', jsonb_build_object('barId', 5)
  )
) WHERE legacy_place_id = 9;

UPDATE establishments SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
  'profile', 'pracinha',
  'rules', jsonb_build_object(
    'reservations', jsonb_build_object('maxPartySize', 60, 'excludeAreaPrefix', 'Reserva Rooftop - '),
    'cardapio', jsonb_build_object('barId', 4)
  )
) WHERE legacy_place_id = 8;

UPDATE establishments SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
  'profile', 'highline',
  'rules', jsonb_build_object(
    'reservations', jsonb_build_object('excludeAreaPrefix', 'Reserva Rooftop - '),
    'cardapio', jsonb_build_object('barId', 3)
  )
) WHERE legacy_place_id = 7;

UPDATE establishments SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
  'profile', 'oh_fregues',
  'rules', jsonb_build_object(
    'reservations', jsonb_build_object('excludeAreaPrefix', 'Reserva Rooftop - '),
    'cardapio', jsonb_build_object('barId', 2)
  )
) WHERE legacy_place_id = 4;

UPDATE establishments SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
  'profile', 'seu_justino',
  'rules', jsonb_build_object(
    'reservations', jsonb_build_object('excludeAreaPrefix', 'Reserva Rooftop - '),
    'cardapio', jsonb_build_object('barId', 1)
  )
) WHERE legacy_place_id = 1;
