-- =====================================================
-- MIGRAÇÃO: Áreas do Reserva Rooftop
-- Insere áreas com capacidades máximas de segurança (px = pessoas)
-- Usar apenas se a tabela restaurant_areas já existir
-- =====================================================

-- PostgreSQL: inserir áreas do Reserva Rooftop (evita duplicar por name)
INSERT INTO restaurant_areas (name, description, capacity_lunch, capacity_dinner, is_active)
SELECT t.n, t.d, t.cl, t.cd, t.ia
FROM (VALUES
  ('Reserva Rooftop - Corredor'::text, '5 mesas de 4'::text, 20, 20, TRUE),
  ('Reserva Rooftop - LG 1', '5 mesas de 8 + 4 mesas de 4 Spaten', 56, 56, TRUE),
  ('Reserva Rooftop - LG 2', 'Limite 48 px', 48, 48, TRUE),
  ('Reserva Rooftop - LG 3', '5 mesas de 4 + 2 mesas de 8', 36, 36, TRUE),
  ('Reserva Rooftop - Gramado 1', 'Área de Sofás: 5 sofás 6p + 2 sofás 2p + 1 mesa alta 2p + 1 mesa alta 4p', 40, 40, TRUE),
  ('Reserva Rooftop - Gramado 2', 'Área de Giro/Fila: 1 mesa alta 2p + 4 mesas altas 8p + Bistrôs', 34, 34, TRUE),
  ('Reserva Rooftop - Parrilha', 'Bistrôs + Mesas altas variadas', 22, 22, TRUE),
  ('Reserva Rooftop - Redário', 'Uso exclusivo Bistrôs', 0, 0, TRUE),
  ('Reserva Rooftop - PQ 1', 'Área PQ: máx 3 reservas simultâneas, 12-16 assentos', 36, 36, TRUE),
  ('Reserva Rooftop - PQ 2', 'Área PQ: máx 3 reservas simultâneas, 12-16 assentos', 36, 36, TRUE),
  ('Reserva Rooftop - PQ 3', 'Mix mesas retangulares 8 e 4 assentos', 32, 32, TRUE),
  ('Reserva Rooftop - PQ 4', '2 mesas hex 8p + 3 mesas retangulares altas 8p', 40, 40, TRUE)
) AS t(n, d, cl, cd, ia)
WHERE NOT EXISTS (SELECT 1 FROM restaurant_areas ra WHERE ra.name = t.n);
