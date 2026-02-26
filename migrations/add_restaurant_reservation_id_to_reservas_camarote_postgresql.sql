-- Migração: vincular reserva de camarote à reserva de restaurante (calendário)
-- Assim, ao cancelar/editar a reserva de camarote, a reserva no calendário pode ser atualizada em cascata.
-- PostgreSQL

-- Adicionar coluna em reservas_camarote (nullable para não quebrar reservas existentes)
ALTER TABLE reservas_camarote
  ADD COLUMN IF NOT EXISTS restaurant_reservation_id INTEGER NULL;

-- Índice para buscar reserva de restaurante a partir da reserva de camarote
CREATE INDEX IF NOT EXISTS idx_reservas_camarote_restaurant_reservation_id
  ON reservas_camarote(restaurant_reservation_id);

-- Opcional: FK para integridade (descomente se a tabela restaurant_reservations existir no mesmo schema)
-- ALTER TABLE reservas_camarote
--   ADD CONSTRAINT fk_reservas_camarote_restaurant_reservation
--   FOREIGN KEY (restaurant_reservation_id) REFERENCES restaurant_reservations(id) ON DELETE SET NULL;
