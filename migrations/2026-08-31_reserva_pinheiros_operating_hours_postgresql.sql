-- Horários Reserva Pinheiros — restaurante (janela única por dia, sem giros)
-- establishment_id = 9
-- Dom: 12:00–20:30 | Seg: fechado | Ter–Qui: 18:00–22:30 | Sex–Sáb: 12:00–22:30

INSERT INTO restaurant_reservation_operating_hours (
  establishment_id, weekday, is_open, start_time, end_time,
  second_start_time, second_end_time, updated_at
)
VALUES
  (9, 0, TRUE,  '12:00', '20:30', NULL, NULL, NOW()),
  (9, 1, FALSE, NULL,    NULL,    NULL, NULL, NOW()),
  (9, 2, TRUE,  '18:00', '22:30', NULL, NULL, NOW()),
  (9, 3, TRUE,  '18:00', '22:30', NULL, NULL, NOW()),
  (9, 4, TRUE,  '18:00', '22:30', NULL, NULL, NOW()),
  (9, 5, TRUE,  '12:00', '22:30', NULL, NULL, NOW()),
  (9, 6, TRUE,  '12:00', '22:30', NULL, NULL, NOW())
ON CONFLICT (establishment_id, weekday) DO UPDATE SET
  is_open = EXCLUDED.is_open,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  second_start_time = EXCLUDED.second_start_time,
  second_end_time = EXCLUDED.second_end_time,
  updated_at = NOW();
