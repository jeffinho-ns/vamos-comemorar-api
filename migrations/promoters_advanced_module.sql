-- ========================================
-- MÓDULO AVANÇADO DE PROMOTERS
-- Script DDL para funcionalidades completas de promoters
-- Data: 2025-01-27
-- ========================================

-- ========================================
-- PARTE 1: EXPANSÃO DA TABELA PROMOTERS
-- ========================================

-- Adicionar campos avançados à tabela promoters existente
ALTER TABLE `promoters` 
ADD COLUMN IF NOT EXISTS `apelido` VARCHAR(50) DEFAULT NULL COMMENT 'Apelido ou nome artístico',
ADD COLUMN IF NOT EXISTS `codigo_identificador` VARCHAR(20) UNIQUE DEFAULT NULL COMMENT 'Código único do promoter (ex: PROMO123)',
ADD COLUMN IF NOT EXISTS `data_cadastro` DATE DEFAULT NULL COMMENT 'Data de cadastro do promoter',
ADD COLUMN IF NOT EXISTS `tipo_categoria` ENUM('A', 'B', 'C', 'VIP', 'Standard') DEFAULT 'Standard' COMMENT 'Categoria do promoter',
ADD COLUMN IF NOT EXISTS `comissao_percentual` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Percentual de comissão',
ADD COLUMN IF NOT EXISTS `link_convite` VARCHAR(255) DEFAULT NULL COMMENT 'Link personalizado de convite',
ADD COLUMN IF NOT EXISTS `qr_code` TEXT DEFAULT NULL COMMENT 'QR Code do promoter',
ADD COLUMN IF NOT EXISTS `observacoes` TEXT DEFAULT NULL COMMENT 'Observações gerais sobre o promoter';

-- ========================================
-- PARTE 2: TABELA DE CONDIÇÕES POR PROMOTER
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_condicoes` (
  `condicao_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `max_convidados_por_evento` INT(11) DEFAULT NULL COMMENT 'Máximo de convidados por evento',
  `max_convidados_por_data` INT(11) DEFAULT NULL COMMENT 'Máximo de convidados por data específica',
  `quota_mesas` INT(11) DEFAULT NULL COMMENT 'Quota de mesas permitidas',
  `quota_entradas` INT(11) DEFAULT NULL COMMENT 'Quota de entradas permitidas',
  `entradas_gratuitas` INT(11) DEFAULT 0 COMMENT 'Número de entradas gratuitas',
  `desconto_especial_percentual` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Desconto especial em %',
  `valor_minimo_consumo` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Valor mínimo de consumo por convidado',
  `horario_checkin_inicio` TIME DEFAULT NULL COMMENT 'Horário início permitido para check-in',
  `horario_checkin_fim` TIME DEFAULT NULL COMMENT 'Horário fim permitido para check-in',
  `politica_no_show` TEXT DEFAULT NULL COMMENT 'Política para no-shows',
  `pode_reservar_mesas_vip` BOOLEAN DEFAULT FALSE COMMENT 'Pode reservar mesas VIP',
  `pode_selecionar_areas` BOOLEAN DEFAULT FALSE COMMENT 'Pode selecionar áreas específicas',
  `ativo` BOOLEAN DEFAULT TRUE COMMENT 'Se as condições estão ativas',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`condicao_id`),
  INDEX `idx_promoter` (`promoter_id`),
  INDEX `idx_ativo` (`ativo`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Condições e regras específicas por promoter';

-- ========================================
-- PARTE 3: TABELA DE CONDIÇÕES POR EVENTO
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_evento_condicoes` (
  `evento_condicao_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) NOT NULL,
  `max_convidados_especifico` INT(11) DEFAULT NULL COMMENT 'Máximo específico para este evento',
  `entradas_gratuitas_especifico` INT(11) DEFAULT 0 COMMENT 'Entradas gratuitas para este evento',
  `desconto_especifico` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Desconto específico para este evento',
  `valor_minimo_consumo_especifico` DECIMAL(10,2) DEFAULT NULL COMMENT 'Valor mínimo específico para este evento',
  `mesas_reservadas` TEXT DEFAULT NULL COMMENT 'JSON com IDs das mesas reservadas',
  `areas_permitidas` TEXT DEFAULT NULL COMMENT 'JSON com IDs das áreas permitidas',
  `observacoes_evento` TEXT DEFAULT NULL COMMENT 'Observações específicas para este evento',
  `ativo` BOOLEAN DEFAULT TRUE COMMENT 'Se as condições estão ativas para este evento',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`evento_condicao_id`),
  INDEX `idx_promoter_evento` (`promoter_id`, `evento_id`),
  INDEX `idx_evento` (`evento_id`),
  INDEX `idx_ativo` (`ativo`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Condições específicas do promoter para eventos individuais';

-- ========================================
-- PARTE 4: TABELA DE HISTÓRICO DE PERFORMANCE
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_performance` (
  `performance_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) NOT NULL,
  `data_evento` DATE NOT NULL,
  `convidados_convidados` INT(11) DEFAULT 0 COMMENT 'Total de convidados convidados',
  `convidados_compareceram` INT(11) DEFAULT 0 COMMENT 'Total de convidados que compareceram',
  `taxa_comparecimento` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Taxa de comparecimento em %',
  `receita_gerada` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Receita gerada pelos convidados',
  `consumacao_total` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total de consumação',
  `entradas_vendidas` INT(11) DEFAULT 0 COMMENT 'Entradas vendidas',
  `comissao_calculada` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Comissão calculada',
  `observacoes_performance` TEXT DEFAULT NULL COMMENT 'Observações sobre a performance',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`performance_id`),
  INDEX `idx_promoter` (`promoter_id`),
  INDEX `idx_evento` (`evento_id`),
  INDEX `idx_data_evento` (`data_evento`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Histórico de performance dos promoters por evento';

-- ========================================
-- PARTE 5: TABELA DE PERMISSÕES DO PROMOTER
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_permissoes` (
  `permissao_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `pode_ver_lista_convidados` BOOLEAN DEFAULT TRUE COMMENT 'Pode ver sua lista de convidados',
  `pode_adicionar_convidados` BOOLEAN DEFAULT TRUE COMMENT 'Pode adicionar convidados',
  `pode_remover_convidados` BOOLEAN DEFAULT TRUE COMMENT 'Pode remover convidados',
  `pode_gerar_link_convite` BOOLEAN DEFAULT TRUE COMMENT 'Pode gerar link de convite',
  `pode_gerar_qr_code` BOOLEAN DEFAULT TRUE COMMENT 'Pode gerar QR code',
  `pode_ver_historico` BOOLEAN DEFAULT TRUE COMMENT 'Pode ver histórico de eventos',
  `pode_ver_relatorios` BOOLEAN DEFAULT FALSE COMMENT 'Pode ver relatórios de performance',
  `pode_ultrapassar_limites` BOOLEAN DEFAULT FALSE COMMENT 'Pode ultrapassar limites (admin)',
  `pode_aprovar_convidados_extra` BOOLEAN DEFAULT FALSE COMMENT 'Pode aprovar convidados extras',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`permissao_id`),
  INDEX `idx_promoter` (`promoter_id`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permissões específicas do promoter';

-- ========================================
-- PARTE 6: TABELA DE ALERTAS E NOTIFICAÇÕES
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_alertas` (
  `alerta_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) DEFAULT NULL COMMENT 'NULL = alerta geral',
  `tipo_alerta` ENUM('quota_baixa', 'limite_atingido', 'performance_baixa', 'no_show_alto', 'comissao_disponivel', 'evento_proximo') NOT NULL,
  `titulo` VARCHAR(100) NOT NULL,
  `mensagem` TEXT NOT NULL,
  `prioridade` ENUM('baixa', 'media', 'alta', 'critica') DEFAULT 'media',
  `lido` BOOLEAN DEFAULT FALSE,
  `data_expiracao` DATETIME DEFAULT NULL COMMENT 'Data de expiração do alerta',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`alerta_id`),
  INDEX `idx_promoter` (`promoter_id`),
  INDEX `idx_evento` (`evento_id`),
  INDEX `idx_tipo` (`tipo_alerta`),
  INDEX `idx_lido` (`lido`),
  INDEX `idx_prioridade` (`prioridade`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sistema de alertas e notificações para promoters';

-- ========================================
-- PARTE 7: TABELA DE TERMOS E CONTRATOS
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_termos` (
  `termo_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `tipo_termo` ENUM('contrato', 'termo_responsabilidade', 'politica_comissao', 'regulamento') NOT NULL,
  `titulo` VARCHAR(100) NOT NULL,
  `conteudo` TEXT NOT NULL,
  `versao` VARCHAR(10) DEFAULT '1.0',
  `aceito` BOOLEAN DEFAULT FALSE,
  `data_aceite` DATETIME DEFAULT NULL,
  `ip_aceite` VARCHAR(45) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`termo_id`),
  INDEX `idx_promoter` (`promoter_id`),
  INDEX `idx_tipo` (`tipo_termo`),
  INDEX `idx_aceito` (`aceito`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Termos, contratos e políticas aceitas pelos promoters';

-- ========================================
-- PARTE 8: INSERIR DADOS PADRÃO
-- ========================================

-- Inserir permissões padrão para promoters existentes
INSERT IGNORE INTO `promoter_permissoes` (`promoter_id`, `pode_ver_lista_convidados`, `pode_adicionar_convidados`, `pode_remover_convidados`, `pode_gerar_link_convite`, `pode_gerar_qr_code`, `pode_ver_historico`, `pode_ver_relatorios`, `pode_ultrapassar_limites`, `pode_aprovar_convidados_extra`)
SELECT 
  `promoter_id`,
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE
FROM `promoters` 
WHERE `promoter_id` NOT IN (SELECT `promoter_id` FROM `promoter_permissoes`);

-- Inserir condições padrão para promoters existentes
INSERT IGNORE INTO `promoter_condicoes` (`promoter_id`, `max_convidados_por_evento`, `max_convidados_por_data`, `quota_mesas`, `quota_entradas`, `entradas_gratuitas`, `desconto_especial_percentual`, `valor_minimo_consumo`, `pode_reservar_mesas_vip`, `pode_selecionar_areas`, `ativo`)
SELECT 
  `promoter_id`,
  30, 50, 5, 20, 5, 10.00, 100.00, FALSE, FALSE, TRUE
FROM `promoters` 
WHERE `promoter_id` NOT IN (SELECT `promoter_id` FROM `promoter_condicoes`);

-- ========================================
-- PARTE 9: ÍNDICES ADICIONAIS PARA PERFORMANCE
-- ========================================

-- Índices compostos para consultas frequentes
CREATE INDEX IF NOT EXISTS `idx_promoter_status_ativo` ON `promoters` (`status`, `promoter_id`);
CREATE INDEX IF NOT EXISTS `idx_condicoes_promoter_ativo` ON `promoter_condicoes` (`promoter_id`, `ativo`);
CREATE INDEX IF NOT EXISTS `idx_performance_promoter_data` ON `promoter_performance` (`promoter_id`, `data_evento`);
CREATE INDEX IF NOT EXISTS `idx_alertas_promoter_lido` ON `promoter_alertas` (`promoter_id`, `lido`, `prioridade`);

-- ========================================
-- PARTE 10: COMENTÁRIOS E DOCUMENTAÇÃO
-- ========================================

-- Adicionar comentários às tabelas existentes
ALTER TABLE `promoters` COMMENT = 'Tabela principal de promoters com informações básicas e avançadas';
ALTER TABLE `listas` COMMENT = 'Listas de convidados associadas aos eventos e promoters';
ALTER TABLE `listas_convidados` COMMENT = 'Convidados das listas com controle de check-in e status';

-- ========================================
-- FIM DO SCRIPT
-- ========================================
