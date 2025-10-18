-- ========================================
-- MÓDULO DE EVENTOS E LISTAS
-- Script DDL para criação das tabelas
-- Data: 2025-10-16
-- ========================================

-- Tabela de Promoters
CREATE TABLE IF NOT EXISTS `promoters` (
  `promoter_id` INT(11) NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `telefone` VARCHAR(20) DEFAULT NULL,
  `status` ENUM('Ativo', 'Inativo') NOT NULL DEFAULT 'Ativo',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`promoter_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de promoters para gerenciamento de eventos e listas';

-- Tabela de Eventos (nova estrutura específica para este módulo)
-- Nota: Já existe uma tabela 'eventos' no banco, então vamos criar 'eventos_listas'
CREATE TABLE IF NOT EXISTS `eventos_listas` (
  `evento_id` INT(11) NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `data_evento` DATE NOT NULL,
  `horario_funcionamento` VARCHAR(100) DEFAULT NULL,
  `descricao` TEXT DEFAULT NULL,
  `promoter_criador_id` INT(11) DEFAULT NULL,
  `establishment_id` INT(11) DEFAULT NULL,
  `status` ENUM('Ativo', 'Cancelado', 'Finalizado') NOT NULL DEFAULT 'Ativo',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`evento_id`),
  INDEX `idx_data_evento` (`data_evento`),
  INDEX `idx_promoter_criador` (`promoter_criador_id`),
  INDEX `idx_establishment` (`establishment_id`),
  INDEX `idx_status` (`status`),
  FOREIGN KEY (`promoter_criador_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de eventos para o módulo de listas e check-in';

-- Tabela de Listas
CREATE TABLE IF NOT EXISTS `listas` (
  `lista_id` INT(11) NOT NULL AUTO_INCREMENT,
  `evento_id` INT(11) NOT NULL,
  `promoter_responsavel_id` INT(11) DEFAULT NULL COMMENT 'NULL = Lista da Casa',
  `nome` VARCHAR(100) NOT NULL,
  `tipo` ENUM('Promoter', 'Aniversário', 'Casa') NOT NULL,
  `observacoes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lista_id`),
  INDEX `idx_evento` (`evento_id`),
  INDEX `idx_promoter` (`promoter_responsavel_id`),
  INDEX `idx_tipo` (`tipo`),
  FOREIGN KEY (`evento_id`) REFERENCES `eventos_listas`(`evento_id`) ON DELETE CASCADE,
  FOREIGN KEY (`promoter_responsavel_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de listas associadas aos eventos';

-- Tabela de Convidados das Listas
CREATE TABLE IF NOT EXISTS `listas_convidados` (
  `lista_convidado_id` INT(11) NOT NULL AUTO_INCREMENT,
  `lista_id` INT(11) NOT NULL,
  `user_id` INT(11) DEFAULT NULL COMMENT 'Referência opcional ao usuário registrado',
  `nome_convidado` VARCHAR(100) NOT NULL,
  `telefone_convidado` VARCHAR(20) DEFAULT NULL,
  `email_convidado` VARCHAR(100) DEFAULT NULL,
  `status_checkin` ENUM('Pendente', 'Check-in', 'No-Show') NOT NULL DEFAULT 'Pendente',
  `is_vip` BOOLEAN NOT NULL DEFAULT FALSE,
  `data_checkin` DATETIME DEFAULT NULL,
  `observacoes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lista_convidado_id`),
  INDEX `idx_lista` (`lista_id`),
  INDEX `idx_status_checkin` (`status_checkin`),
  INDEX `idx_data_checkin` (`data_checkin`),
  INDEX `idx_nome` (`nome_convidado`),
  INDEX `idx_is_vip` (`is_vip`),
  FOREIGN KEY (`lista_id`) REFERENCES `listas`(`lista_id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de convidados das listas com controle de check-in';

-- Tabela de Benefícios
CREATE TABLE IF NOT EXISTS `beneficios` (
  `beneficio_id` INT(11) NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `descricao` TEXT DEFAULT NULL,
  `tipo` ENUM('Entrada', 'Bebida', 'Consumação', 'Desconto', 'Outros') DEFAULT 'Outros',
  `valor` VARCHAR(50) DEFAULT NULL COMMENT 'Valor do benefício (ex: R$ 50, 20%, 1 drink)',
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`beneficio_id`),
  INDEX `idx_ativo` (`ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de benefícios que podem ser associados aos convidados';

-- Tabela de Relacionamento Convidado-Benefício
CREATE TABLE IF NOT EXISTS `lista_convidado_beneficio` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `lista_convidado_id` INT(11) NOT NULL,
  `beneficio_id` INT(11) NOT NULL,
  `utilizado` BOOLEAN NOT NULL DEFAULT FALSE,
  `data_utilizacao` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_lista_convidado` (`lista_convidado_id`),
  INDEX `idx_beneficio` (`beneficio_id`),
  UNIQUE KEY `unique_convidado_beneficio` (`lista_convidado_id`, `beneficio_id`),
  FOREIGN KEY (`lista_convidado_id`) REFERENCES `listas_convidados`(`lista_convidado_id`) ON DELETE CASCADE,
  FOREIGN KEY (`beneficio_id`) REFERENCES `beneficios`(`beneficio_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de relacionamento entre convidados e benefícios';

-- Tabela de Hostess
CREATE TABLE IF NOT EXISTS `hostess` (
  `hostess_id` INT(11) NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) DEFAULT NULL,
  `telefone` VARCHAR(20) DEFAULT NULL,
  `funcao` VARCHAR(50) DEFAULT 'Hostess' COMMENT 'Ex: Hostess, Gerente de Porta, Coordenador',
  `status` ENUM('Ativo', 'Inativo') NOT NULL DEFAULT 'Ativo',
  `establishment_id` INT(11) DEFAULT NULL,
  `foto_url` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`hostess_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_establishment` (`establishment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de hostess para gerenciamento de equipe';

-- ========================================
-- INSERÇÃO DE DADOS INICIAIS
-- ========================================

-- Inserir alguns promoters de exemplo
INSERT INTO `promoters` (`nome`, `email`, `telefone`, `status`) VALUES
('João Silva', 'joao.silva@promoter.com', '11987654321', 'Ativo'),
('Maria Santos', 'maria.santos@promoter.com', '11987654322', 'Ativo'),
('Pedro Costa', 'pedro.costa@promoter.com', '11987654323', 'Ativo'),
('Ana Oliveira', 'ana.oliveira@promoter.com', '11987654324', 'Ativo')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Inserir alguns benefícios padrão
INSERT INTO `beneficios` (`nome`, `descricao`, `tipo`, `valor`, `ativo`) VALUES
('Entrada Grátis', 'Entrada gratuita no evento', 'Entrada', 'Grátis', TRUE),
('1 Drink na Entrada', 'Um drink cortesia ao entrar', 'Bebida', '1 drink', TRUE),
('Consumação R$ 50', 'R$ 50 em consumação', 'Consumação', 'R$ 50', TRUE),
('Desconto 20%', '20% de desconto no consumo', 'Desconto', '20%', TRUE),
('Open Bar 2h', 'Open bar por 2 horas', 'Bebida', '2 horas', TRUE),
('Área VIP', 'Acesso à área VIP', 'Outros', 'Acesso VIP', TRUE)
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Inserir algumas hostess de exemplo
INSERT INTO `hostess` (`nome`, `email`, `telefone`, `funcao`, `status`) VALUES
('Carla Mendes', 'carla.mendes@hostess.com', '11987654330', 'Hostess', 'Ativo'),
('Juliana Lima', 'juliana.lima@hostess.com', '11987654331', 'Hostess', 'Ativo'),
('Fernanda Rocha', 'fernanda.rocha@hostess.com', '11987654332', 'Gerente de Porta', 'Ativo'),
('Beatriz Alves', 'beatriz.alves@hostess.com', '11987654333', 'Coordenador', 'Ativo')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- ========================================
-- FIM DO SCRIPT
-- ========================================




