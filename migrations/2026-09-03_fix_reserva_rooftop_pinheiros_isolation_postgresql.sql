-- Isola áreas Reserva Rooftop (place 9) vs Reserva Pinheiros (place 21).
-- Recupera reservas gravadas com bars.id (5 / 18).
-- Reservas Pinheiros (Deck/Salão) criadas ANTES do split 2026-09-02 saem do place 9.

SET search_path TO meu_backup_db, public;

UPDATE restaurant_areas
   SET establishment_id = 9,
       is_active = TRUE
 WHERE name LIKE 'Reserva Rooftop - %'
   AND (establishment_id IS NULL OR establishment_id IN (5, 9));

UPDATE restaurant_areas
   SET establishment_id = 21,
       is_active = TRUE
 WHERE name LIKE 'Reserva - %'
   AND name NOT LIKE 'Reserva Rooftop - %'
   AND (establishment_id IS NULL OR establishment_id IN (5, 9, 18, 21));

UPDATE restaurant_reservations
   SET establishment_id = 9
 WHERE establishment_id = 5;

UPDATE restaurant_reservations
   SET establishment_id = 21
 WHERE establishment_id = 18;

UPDATE restaurant_reservations rr
   SET establishment_id = 21
  FROM restaurant_areas ra
 WHERE rr.area_id = ra.id
   AND rr.establishment_id = 9
   AND ra.name LIKE 'Reserva - %'
   AND ra.name NOT LIKE 'Reserva Rooftop - %'
   AND COALESCE(rr.created_at, (rr.reservation_date::timestamp)) < TIMESTAMPTZ '2026-09-02 00:00:00-03';
