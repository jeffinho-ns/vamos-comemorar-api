-- Reserva Pinheiros: restaurante com check-in/check-out (sem giros almoço/jantar)
UPDATE meu_backup_db.establishments
SET config = COALESCE(config, '{}'::jsonb)
  || jsonb_build_object('profile', 'reserva')
  || jsonb_build_object(
    'rules',
    COALESCE(config->'rules', '{}'::jsonb)
      || jsonb_build_object(
        'reservations',
        COALESCE(config->'rules'->'reservations', '{}'::jsonb)
          || jsonb_build_object(
            'dualShift', false,
            'tableBlocking', 'overlap',
            'strictHours', true,
            'areaNamePrefix', 'Reserva - '
          )
      )
      || jsonb_build_object(
        'events',
        COALESCE(config->'rules'->'events', '{}'::jsonb)
          || jsonb_build_object('extendedGuestListWindow', true)
      )
  )
WHERE legacy_place_id = 9;
