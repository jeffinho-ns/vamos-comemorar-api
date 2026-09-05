-- Áreas públicas do Reserva Rooftop (preferência do cliente no /reservar).
-- Subáreas operacionais (LG, Gramado, PQ…) permanecem para o painel admin.

SET search_path TO meu_backup_db, public;

INSERT INTO restaurant_areas (name, description, capacity_lunch, capacity_dinner, is_active, establishment_id)
SELECT t.n, t.d, t.cl, t.cd, TRUE, 9
FROM (VALUES
  (
    'Reserva Rooftop - Área Interna'::text,
    'Preferência pública do cliente — alocação fina pelo admin'::text,
    120,
    120
  ),
  (
    'Reserva Rooftop - Área Externa',
    'Preferência pública do cliente — alocação fina pelo admin',
    100,
    100
  ),
  (
    'Reserva Rooftop - Salão',
    'Preferência pública do cliente — alocação fina pelo admin',
    80,
    80
  )
) AS t(n, d, cl, cd)
WHERE NOT EXISTS (
  SELECT 1 FROM restaurant_areas ra WHERE ra.name = t.n
);

-- Se já existiam sem establishment_id, vincula ao Rooftop
UPDATE restaurant_areas
   SET establishment_id = 9,
       is_active = TRUE
 WHERE name IN (
   'Reserva Rooftop - Área Interna',
   'Reserva Rooftop - Área Externa',
   'Reserva Rooftop - Salão'
 )
 AND (establishment_id IS NULL OR establishment_id IN (5, 9));
