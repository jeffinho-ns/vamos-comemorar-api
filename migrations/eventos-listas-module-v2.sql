-- ========================================
-- MÓDULO DE EVENTOS E LISTAS - V2 (INTEGRADO)
-- Script DDL integrado com tabela eventos existente
-- Data: 2025-10-16
-- ========================================

-- ========================================
-- PARTE 1: EXTENSÃO DA TABELA EVENTOS
-- ========================================

-- Adicionar coluna para identificar eventos que usam sistema de listas
ALTER TABLE `eventos` 
ADD COLUMN IF NOT EXISTS `usado_para_listas` BOOLEAN DEFAULT FALSE 
COMMENT 'Indica se este evento utiliza o sistema de listas e promoters';

-- Adicionar coluna para promoter criador (se não existir)
ALTER TABLE `eventos` 
ADD COLUMN IF NOT EXISTS `promoter_criador_id` INT(11) DEFAULT NULL 
COMMENT 'Promoter que criou/gerencia este evento';

-- ========================================
-- PARTE 2: TABELA DE PROMOTERS
-- ========================================

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

-- ========================================
-- PARTE 3: TABELA DE LISTAS
-- ========================================

CREATE TABLE IF NOT EXISTS `listas` (
  `lista_id` INT(11) NOT NULL AUTO_INCREMENT,
  `evento_id` INT(11) NOT NULL COMMENT 'FK para tabela eventos existente',
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
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`promoter_responsavel_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela de listas associadas aos eventos existentes';

-- ========================================
-- PARTE 4: TABELA DE CONVIDADOS DAS LISTAS
-- ========================================

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

-- ========================================
-- PARTE 5: TABELA DE BENEFÍCIOS
-- ========================================

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

-- ========================================
-- PARTE 6: RELACIONAMENTO CONVIDADO-BENEFÍCIO
-- ========================================

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

-- ========================================
-- PARTE 7: TABELA DE HOSTESS
-- ========================================

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
-- PARTE 8: FOREIGN KEYS ADICIONAIS
-- ========================================

-- Adicionar FK de promoter_criador_id em eventos (se não existir)
-- Nota: Isso pode falhar se já existir, então usamos procedure condicional

DELIMITER $$

CREATE PROCEDURE add_promoter_fk_if_not_exists()
BEGIN
    DECLARE constraint_exists INT;
    
    SELECT COUNT(*) INTO constraint_exists
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'eventos'
    AND CONSTRAINT_NAME = 'fk_eventos_promoter';
    
    IF constraint_exists = 0 THEN
        ALTER TABLE `eventos`
        ADD CONSTRAINT `fk_eventos_promoter`
        FOREIGN KEY (`promoter_criador_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE SET NULL;
    END IF;
END$$

DELIMITER ;

CALL add_promoter_fk_if_not_exists();
DROP PROCEDURE IF EXISTS add_promoter_fk_if_not_exists;

-- ========================================
-- PARTE 9: INSERÇÃO DE DADOS INICIAIS
-- ========================================

-- Inserir promoters de exemplo
INSERT INTO `promoters` (`nome`, `email`, `telefone`, `status`) VALUES
('João Silva', 'joao.silva@promoter.com', '11987654321', 'Ativo'),
('Maria Santos', 'maria.santos@promoter.com', '11987654322', 'Ativo'),
('Pedro Costa', 'pedro.costa@promoter.com', '11987654323', 'Ativo'),
('Ana Oliveira', 'ana.oliveira@promoter.com', '11987654324', 'Ativo')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Inserir benefícios padrão
INSERT INTO `beneficios` (`nome`, `descricao`, `tipo`, `valor`, `ativo`) VALUES
('Entrada Grátis', 'Entrada gratuita no evento', 'Entrada', 'Grátis', TRUE),
('1 Drink na Entrada', 'Um drink cortesia ao entrar', 'Bebida', '1 drink', TRUE),
('Consumação R$ 50', 'R$ 50 em consumação', 'Consumação', 'R$ 50', TRUE),
('Desconto 20%', '20% de desconto no consumo', 'Desconto', '20%', TRUE),
('Open Bar 2h', 'Open bar por 2 horas', 'Bebida', '2 horas', TRUE),
('Área VIP', 'Acesso à área VIP', 'Outros', 'Acesso VIP', TRUE)
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- Inserir hostess de exemplo
INSERT INTO `hostess` (`nome`, `email`, `telefone`, `funcao`, `status`) VALUES
('Carla Mendes', 'carla.mendes@hostess.com', '11987654330', 'Hostess', 'Ativo'),
('Juliana Lima', 'juliana.lima@hostess.com', '11987654331', 'Hostess', 'Ativo'),
('Fernanda Rocha', 'fernanda.rocha@hostess.com', '11987654332', 'Gerente de Porta', 'Ativo'),
('Beatriz Alves', 'beatriz.alves@hostess.com', '11987654333', 'Coordenador', 'Ativo')
ON DUPLICATE KEY UPDATE `nome` = VALUES(`nome`);

-- ========================================
-- PARTE 10: COMENTÁRIOS E OBSERVAÇÕES
-- ========================================

/*
INTEGRAÇÃO COM SISTEMA EXISTENTE:

1. EVENTOS ÚNICOS VS SEMANAIS:
   - A tabela 'eventos' já possui os campos:
     * tipo_evento ENUM('unico','semanal')
     * dia_da_semana INT(11)
   - O sistema de listas funciona com AMBOS os tipos
   - Eventos semanais geram listas recorrentes
   - Eventos únicos geram listas pontuais

2. COMPATIBILIDADE:
   - Mantém 100% de compatibilidade com sistema existente
   - Adiciona campo 'usado_para_listas' para identificar eventos com listas
   - Não quebra funcionalidades de reservas, convidados normais, etc.

3. MIGRAÇÃO:
   - Se já existir tabela 'eventos_listas', deve ser removida
   - Dados devem ser migrados para 'eventos' se necessário
   - Foreign keys ajustadas automaticamente

4. QUERIES:
   - Filtrar eventos com listas: WHERE usado_para_listas = TRUE
   - Filtrar eventos normais: WHERE usado_para_listas = FALSE OR usado_para_listas IS NULL
   - Buscar próximo evento (único): WHERE tipo_evento = 'unico' AND data_do_evento >= CURDATE()
   - Buscar eventos semanais ativos: WHERE tipo_evento = 'semanal' AND (campo_ativo = TRUE)
*/

-- ========================================
-- FIM DO SCRIPT
-- ========================================

SELECT '✅ Script executado com sucesso!' AS status;
SELECT 'Módulo de Eventos e Listas integrado com tabela eventos existente' AS info;



