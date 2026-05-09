-- Highline permanece em places.id = 7 (eventos, reservas).
-- Sitio Ilha: novo registro em `places` (cardápio); id gerado pela sequência — não reutilizar o id 7.
--
-- Após executar, obtenha o id criado:
--   SELECT id, slug, name FROM places WHERE slug = 'sitio-ilha';
-- No frontend (.env): NEXT_PUBLIC_SITIO_ILHA_PLACE_ID=<id>

INSERT INTO places (slug, name, email, description, logo, street, number, latitude, longitude, status, visible)
SELECT
  'sitio-ilha',
  'Sitio Ilha',
  NULL,
  'Estabelecimento dedicado ao cardápio (sem operação de check-in neste cadastro).',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'active',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM places WHERE lower(slug) = 'sitio-ilha'
);
