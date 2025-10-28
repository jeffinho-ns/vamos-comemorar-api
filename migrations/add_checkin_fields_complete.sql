-- =====================================================
-- MIGRAÇÃO COMPLETA: Campos de Check-in
-- Adiciona todos os campos necessários para o sistema de check-ins
-- Execute este script para garantir que todas as tabelas estão atualizadas
-- =====================================================

-- 1. RESTAURANT_RESERVATIONS: Adicionar campos de check-in se não existirem
ALTER TABLE `restaurant_reservations` 
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0 COMMENT 'Se o dono da reserva fez check-in',
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL COMMENT 'Horário do check-in do dono';

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS `idx_checked_in` ON `restaurant_reservations`(`checked_in`);
CREATE INDEX IF NOT EXISTS `idx_checkin_time` ON `restaurant_reservations`(`checkin_time`);

-- 2. LARGE_RESERVATIONS: Adicionar campos de check-in se não existirem
ALTER TABLE `large_reservations`
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0 COMMENT 'Se o dono da reserva fez check-in',
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL COMMENT 'Horário do check-in do dono',
ADD COLUMN IF NOT EXISTS `event_type` VARCHAR(100) DEFAULT NULL COMMENT 'Tipo do evento: aniversario, despedida, etc';

-- Criar índices
CREATE INDEX IF NOT EXISTS `idx_checked_in` ON `large_reservations`(`checked_in`);
CREATE INDEX IF NOT EXISTS `idx_checkin_time` ON `large_reservations`(`checkin_time`);
CREATE INDEX IF NOT EXISTS `idx_event_type` ON `large_reservations`(`event_type`);

-- 3. GUESTS: Adicionar campos de check-in se não existirem
ALTER TABLE `guests`
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0 COMMENT 'Se o convidado fez check-in',
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL COMMENT 'Horário do check-in';

-- Criar índices
CREATE INDEX IF NOT EXISTS `idx_checked_in` ON `guests`(`checked_in`);
CREATE INDEX IF NOT EXISTS `idx_guest_list_checkin` ON `guests`(`guest_list_id`, `checked_in`);

-- 4. GUEST_LISTS: Adicionar campos de check-in do dono se não existirem
ALTER TABLE `guest_lists`
ADD COLUMN IF NOT EXISTS `owner_checked_in` TINYINT(1) DEFAULT 0 COMMENT 'Se o dono da lista fez check-in',
ADD COLUMN IF NOT EXISTS `owner_checkin_time` TIMESTAMP NULL DEFAULT NULL COMMENT 'Horário do check-in do dono',
ADD COLUMN IF NOT EXISTS `establishment_id` INT(11) DEFAULT NULL COMMENT 'ID do estabelecimento',
ADD COLUMN IF NOT EXISTS `created_by` INT(11) DEFAULT NULL COMMENT 'ID do usuário que criou a lista';

-- Criar índices
CREATE INDEX IF NOT EXISTS `idx_owner_checked_in` ON `guest_lists`(`owner_checked_in`);
CREATE INDEX IF NOT EXISTS `idx_establishment_id` ON `guest_lists`(`establishment_id`);

-- 5. PROMOTERS: Verificar se precisa de campos de check-in
-- A tabela promoters geralmente está ligada a eventos via promoter_eventos
-- Vamos adicionar campos se não existirem

-- Verificar se existe tabela promoter_eventos
CREATE TABLE IF NOT EXISTS `promoter_eventos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` int(11) NOT NULL,
  `evento_id` int(11) NOT NULL,
  `data_evento` date NOT NULL,
  `status` enum('ATIVO','INATIVO','SUSPENSO') DEFAULT 'ATIVO',
  `funcao` enum('PRINCIPAL','AUXILIAR') DEFAULT 'AUXILIAR',
  `observacoes` text DEFAULT NULL,
  `checked_in` TINYINT(1) DEFAULT 0 COMMENT 'Se o promoter fez check-in no evento',
  `checkin_time` TIMESTAMP NULL DEFAULT NULL COMMENT 'Horário do check-in',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promoter_evento_data` (`promoter_id`,`evento_id`,`data_evento`),
  KEY `idx_promoter_id` (`promoter_id`),
  KEY `idx_evento_id` (`evento_id`),
  KEY `idx_data_evento` (`data_evento`),
  KEY `idx_status` (`status`),
  KEY `idx_checked_in` (`checked_in`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Se a tabela já existe, adicionar campos que faltam
ALTER TABLE `promoter_eventos`
ADD COLUMN IF NOT EXISTS `checked_in` TINYINT(1) DEFAULT 0 COMMENT 'Se o promoter fez check-in no evento',
ADD COLUMN IF NOT EXISTS `checkin_time` TIMESTAMP NULL DEFAULT NULL COMMENT 'Horário do check-in';

CREATE INDEX IF NOT EXISTS `idx_promoter_checked_in` ON `promoter_eventos`(`checked_in`);

-- 6. LISTAS_CONVIDADOS_EVENTOS: Verificar campos de check-in
-- Esta é a tabela que armazena os convidados dos promoters para eventos

-- Verificar se a tabela existe e criar se necessário
CREATE TABLE IF NOT EXISTS `listas_convidados_eventos` (
  `lista_convidado_id` int(11) NOT NULL AUTO_INCREMENT,
  `lista_id` int(11) NOT NULL,
  `nome_convidado` varchar(255) NOT NULL,
  `telefone_convidado` varchar(20) DEFAULT NULL,
  `email_convidado` varchar(255) DEFAULT NULL,
  `status_checkin` enum('Pendente','Check-in','No-Show') DEFAULT 'Pendente',
  `data_checkin` timestamp NULL DEFAULT NULL,
  `is_vip` tinyint(1) DEFAULT 0,
  `beneficios` text DEFAULT NULL,
  `observacoes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lista_convidado_id`),
  KEY `idx_lista_id` (`lista_id`),
  KEY `idx_status_checkin` (`status_checkin`),
  KEY `idx_is_vip` (`is_vip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- VALIDAÇÃO: Verificar estruturas
-- =====================================================

-- Verificar se todos os campos foram criados corretamente
SELECT 
    'restaurant_reservations' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'restaurant_reservations'
AND COLUMN_NAME IN ('checked_in', 'checkin_time')
UNION ALL
SELECT 
    'large_reservations' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'large_reservations'
AND COLUMN_NAME IN ('checked_in', 'checkin_time', 'event_type')
UNION ALL
SELECT 
    'guests' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'guests'
AND COLUMN_NAME IN ('checked_in', 'checkin_time')
UNION ALL
SELECT 
    'guest_lists' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'guest_lists'
AND COLUMN_NAME IN ('owner_checked_in', 'owner_checkin_time', 'establishment_id');

-- =====================================================
-- NOTA: Execute esta migração e verifique os resultados
-- =====================================================

