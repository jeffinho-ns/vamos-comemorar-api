-- Renomeia estabelecimento Reserva Rooftop → Reserva Pinheiros (place 9 / bar 5)
-- Mantém slug legado reserva-rooftop para URLs existentes; adiciona alias reserva-pinheiros no bar.

UPDATE places
SET
  slug = 'reserva-pinheiros',
  name = 'Reserva Pinheiros',
  description = 'Restaurante Reserva em Pinheiros — ambientes Deck (mesas ao ar livre) e Salão (mesas, sofás e bar).'
WHERE id = 9;

UPDATE bars
SET
  name = 'Reserva Pinheiros',
  slug = 'reserva-pinheiros'
WHERE id = 5;

UPDATE meu_backup_db.establishments
SET name = 'Reserva Pinheiros'
WHERE legacy_place_id = 9;
