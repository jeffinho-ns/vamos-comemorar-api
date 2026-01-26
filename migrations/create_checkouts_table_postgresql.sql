-- =====================================================
-- MIGRAÇÃO: Criar Tabela de Check-outs (PostgreSQL)
-- Data: 2026-01-27
-- Descrição: Cria tabela dedicada para armazenar histórico completo de check-outs
--            Mantém status "Concluído" permanentemente
-- =====================================================

-- Criar tabela checkouts
CREATE TABLE IF NOT EXISTS checkouts (
  id SERIAL PRIMARY KEY,
  checkout_type VARCHAR(20) NOT NULL CHECK (checkout_type IN ('owner','guest','reservation')),
  entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('guest_list','guest','restaurant_reservation','large_reservation')),
  entity_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  checkin_time TIMESTAMP NULL DEFAULT NULL,
  checkout_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'concluido' CHECK (status IN ('concluido','cancelado')),
  
  guest_list_id INTEGER NULL,
  reservation_id INTEGER NULL,
  table_number VARCHAR(50) NULL,
  area_name VARCHAR(255) NULL,
  establishment_id INTEGER NULL,
  evento_id INTEGER NULL,
  
  entrada_tipo VARCHAR(10) NULL CHECK (entrada_tipo IN ('VIP','SECO','CONSUMA')),
  entrada_valor DECIMAL(10,2) NULL,
  
  created_by INTEGER NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_checkout_type ON checkouts(checkout_type);
CREATE INDEX IF NOT EXISTS idx_entity_type_id ON checkouts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_id ON checkouts(guest_list_id);
CREATE INDEX IF NOT EXISTS idx_reservation_id ON checkouts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_checkout_time ON checkouts(checkout_time);
CREATE INDEX IF NOT EXISTS idx_status ON checkouts(status);
CREATE INDEX IF NOT EXISTS idx_establishment_id ON checkouts(establishment_id);
CREATE INDEX IF NOT EXISTS idx_evento_id ON checkouts(evento_id);
CREATE INDEX IF NOT EXISTS idx_checkin_checkout_times ON checkouts(checkin_time, checkout_time);

-- Verificar se a tabela foi criada corretamente
SELECT 
    'checkouts' as tabela,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = current_schema()
AND table_name = 'checkouts'
ORDER BY ordinal_position;

