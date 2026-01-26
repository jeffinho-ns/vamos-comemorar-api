-- =====================================================
-- MIGRAÇÃO: Criar Tabela de Check-outs
-- Data: 2026-01-27
-- Descrição: Cria tabela dedicada para armazenar histórico completo de check-outs
--            Mantém status "Concluído" permanentemente
-- =====================================================

-- Para MySQL
CREATE TABLE IF NOT EXISTS `checkouts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `checkout_type` enum('owner','guest','reservation') NOT NULL COMMENT 'Tipo de check-out: owner (dono da lista), guest (convidado), reservation (reserva sem lista)',
  `entity_type` enum('guest_list','guest','restaurant_reservation','large_reservation') NOT NULL COMMENT 'Tipo de entidade que fez check-out',
  `entity_id` int(11) NOT NULL COMMENT 'ID da entidade (guest_list_id, guest_id, reservation_id)',
  `name` varchar(255) NOT NULL COMMENT 'Nome da pessoa que fez check-out',
  `checkin_time` timestamp NULL DEFAULT NULL COMMENT 'Horário de check-in',
  `checkout_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Horário de check-out',
  `status` enum('concluido','cancelado') NOT NULL DEFAULT 'concluido' COMMENT 'Status do check-out',
  
  -- Informações adicionais para contexto
  `guest_list_id` int(11) DEFAULT NULL COMMENT 'ID da guest list (se aplicável)',
  `reservation_id` int(11) DEFAULT NULL COMMENT 'ID da reserva (se aplicável)',
  `table_number` varchar(50) DEFAULT NULL COMMENT 'Número da mesa',
  `area_name` varchar(255) DEFAULT NULL COMMENT 'Nome da área',
  `establishment_id` int(11) DEFAULT NULL COMMENT 'ID do estabelecimento',
  `evento_id` int(11) DEFAULT NULL COMMENT 'ID do evento',
  
  -- Informações de entrada (se aplicável)
  `entrada_tipo` enum('VIP','SECO','CONSUMA') DEFAULT NULL COMMENT 'Tipo de entrada',
  `entrada_valor` decimal(10,2) DEFAULT NULL COMMENT 'Valor pago na entrada',
  
  -- Metadados
  `created_by` int(11) DEFAULT NULL COMMENT 'ID do usuário que registrou o check-out',
  `notes` text DEFAULT NULL COMMENT 'Observações adicionais',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  KEY `idx_checkout_type` (`checkout_type`),
  KEY `idx_entity_type_id` (`entity_type`, `entity_id`),
  KEY `idx_guest_list_id` (`guest_list_id`),
  KEY `idx_reservation_id` (`reservation_id`),
  KEY `idx_checkout_time` (`checkout_time`),
  KEY `idx_status` (`status`),
  KEY `idx_establishment_id` (`establishment_id`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_checkin_checkout_times` (`checkin_time`, `checkout_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabela de histórico de check-outs - mantém status concluído permanentemente';

-- =====================================================
-- VERSÃO POSTGRESQL (PRINCIPAL)
-- =====================================================

-- Para PostgreSQL
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

-- Verificar se a tabela foi criada corretamente
SELECT 
    'checkouts' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'checkouts'
ORDER BY ORDINAL_POSITION;

