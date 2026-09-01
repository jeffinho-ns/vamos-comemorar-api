-- =====================================================
-- MIGRAÇÃO: Reserva Pinheiros — novas áreas Deck e Salão
-- Substitui as subáreas legadas "Reserva Rooftop - *"
-- Capacidades (px = pessoas por turno):
--   Deck  → 24 (2 mesas 6p + 1 mesa 8p + 1 mesa 4p)
--   Salão → 118 (90 cadeiras + 14 sofás retos + 8 sofás L + 6 banquetas bar;
--                exclui mesa diretoria frente da parrilla)
-- =====================================================

-- Desativar subáreas antigas do Rooftop (preserva histórico de reservas)
UPDATE restaurant_areas
SET is_active = FALSE
WHERE name LIKE 'Reserva Rooftop - %';

-- Inserir novas áreas (idempotente por name)
INSERT INTO restaurant_areas (name, description, capacity_lunch, capacity_dinner, is_active)
SELECT t.n, t.d, t.cl, t.cd, t.ia
FROM (VALUES
  (
    'Reserva - Deck'::text,
    '2 mesas 6p + 1 mesa 8p + 1 mesa 4p'::text,
    24,
    24,
    TRUE
  ),
  (
    'Reserva - Salão',
    '90 cadeiras + 7 sofás retos (14p) + 2 sofás L (8p) + 6 banquetas bar; exclui mesa diretoria',
    118,
    118,
    TRUE
  )
) AS t(n, d, cl, cd, ia)
WHERE NOT EXISTS (SELECT 1 FROM restaurant_areas ra WHERE ra.name = t.n);

-- Atualizar prefixo de áreas no config SaaS (establishment id 9)
UPDATE meu_backup_db.establishments
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{rules,reservations,areaNamePrefix}',
  '"Reserva - "'::jsonb,
  TRUE
)
WHERE legacy_place_id = 9;

-- Demais estabelecimentos: excluir áreas do Reserva pelo novo prefixo
UPDATE meu_backup_db.establishments
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{rules,reservations,excludeAreaPrefix}',
  '"Reserva - "'::jsonb,
  TRUE
)
WHERE legacy_place_id IN (1, 4, 7, 8, 10)
  AND (config->'rules'->'reservations'->>'excludeAreaPrefix') = 'Reserva Rooftop - ';
