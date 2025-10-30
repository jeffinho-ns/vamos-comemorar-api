-- ========================================
-- EXECUTAR ESTE SQL PRIMEIRO NO BANCO DE DADOS
-- Para corrigir o erro 500 nas páginas públicas de promoters
-- ========================================

-- 1. Criar tabela de convidados dos promoters
CREATE TABLE IF NOT EXISTS `promoter_convidados` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL COMMENT 'ID do promoter',
  `nome` VARCHAR(200) NOT NULL COMMENT 'Nome completo do convidado',
  `whatsapp` VARCHAR(20) NOT NULL COMMENT 'WhatsApp do convidado',
  `evento_id` INT(11) DEFAULT NULL COMMENT 'Evento específico (opcional)',
  `status` ENUM('pendente', 'confirmado', 'cancelado', 'compareceu') DEFAULT 'pendente' COMMENT 'Status do convidado',
  `checkin_realizado` BOOLEAN DEFAULT FALSE COMMENT 'Se já fez check-in',
  `data_checkin` DATETIME DEFAULT NULL COMMENT 'Data e hora do check-in',
  `observacoes` TEXT DEFAULT NULL COMMENT 'Observações sobre o convidado',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de cadastro',
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de atualização',
  PRIMARY KEY (`id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_whatsapp` (`whatsapp`),
  INDEX `idx_evento_id` (`evento_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Convidados cadastrados via link público do promoter';

-- 2. Criar índice para evitar duplicatas (comentado caso já exista)
-- CREATE UNIQUE INDEX `idx_promoter_whatsapp_evento` ON `promoter_convidados` (`promoter_id`, `whatsapp`, `evento_id`);

-- ========================================
-- VERIFICAÇÕES
-- ========================================

-- Verificar se a tabela foi criada
SELECT 'Tabela promoter_convidados criada com sucesso!' as resultado;

-- Ver estrutura da tabela
DESCRIBE promoter_convidados;

-- Contar registros (deve ser 0 no início)
SELECT COUNT(*) as total_convidados FROM promoter_convidados;







