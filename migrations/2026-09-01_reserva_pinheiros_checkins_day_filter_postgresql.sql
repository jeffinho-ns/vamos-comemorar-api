-- Reserva Pinheiros: check-ins devem listar só o dia do evento (não janela mensal).
UPDATE meu_backup_db.establishments
SET config = COALESCE(config, '{}'::jsonb)
  || jsonb_build_object(
    'rules',
    COALESCE(config->'rules', '{}'::jsonb)
      || jsonb_build_object(
        'events',
        COALESCE(config->'rules'->'events', '{}'::jsonb)
          || jsonb_build_object('extendedGuestListWindow', false)
      )
  )
WHERE legacy_place_id = 9;
