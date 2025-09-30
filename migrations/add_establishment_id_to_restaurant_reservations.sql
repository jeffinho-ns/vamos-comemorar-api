-- Migração para adicionar establishment_id à tabela restaurant_reservations
-- Execute este script para adicionar suporte a múltiplos estabelecimentos

-- Adicionar coluna establishment_id
ALTER TABLE restaurant_reservations 
ADD COLUMN establishment_id INT DEFAULT 1 AFTER id;

-- Adicionar índice para melhor performance
CREATE INDEX idx_restaurant_reservations_establishment_id ON restaurant_reservations(establishment_id);

-- Adicionar chave estrangeira (opcional, se a tabela places existir)
-- ALTER TABLE restaurant_reservations 
-- ADD CONSTRAINT fk_restaurant_reservations_establishment 
-- FOREIGN KEY (establishment_id) REFERENCES places(id) ON DELETE SET NULL;

-- Atualizar registros existentes para usar establishment_id = 1 (padrão)
UPDATE restaurant_reservations SET establishment_id = 1 WHERE establishment_id IS NULL;

-- Comentário da migração
-- Esta migração adiciona suporte para múltiplos estabelecimentos nas reservas do restaurante
-- Data: 2024-01-XX
-- Autor: Sistema de Reservas




