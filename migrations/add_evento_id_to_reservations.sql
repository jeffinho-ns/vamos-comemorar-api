-- Migração para adicionar suporte a vincular reservas a eventos
-- Execute este script para permitir que reservas sejam vinculadas a eventos específicos

-- Adicionar coluna evento_id à tabela restaurant_reservations
ALTER TABLE restaurant_reservations 
ADD COLUMN evento_id INT NULL DEFAULT NULL COMMENT 'ID do evento ao qual esta reserva está vinculada',
ADD INDEX idx_evento_id (evento_id);

-- Adicionar coluna evento_id à tabela large_reservations
ALTER TABLE large_reservations 
ADD COLUMN evento_id INT NULL DEFAULT NULL COMMENT 'ID do evento ao qual esta reserva está vinculada',
ADD INDEX idx_evento_id (evento_id);

-- Comentário da migração
-- Esta migração adiciona suporte para vincular reservas de restaurante a eventos específicos
-- Isso permite que a página de check-ins exiba apenas reservas relacionadas ao evento correto
-- Data: 2025-01-XX






