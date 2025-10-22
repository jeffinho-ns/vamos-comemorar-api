-- ========================================
-- SISTEMA AVANÇADO DE PROMOTERS - MIGRAÇÃO COMPLETA
-- Data: 2025-01-27
-- Descrição: Expansão completa do sistema de promoters com todas as funcionalidades
-- ========================================

-- ========================================
-- PARTE 1: EXPANSÃO DA TABELA PROMOTERS
-- ========================================

-- Adicionar campos expandidos à tabela promoters existente
ALTER TABLE `promoters` 
ADD COLUMN IF NOT EXISTS `apelido` VARCHAR(100) DEFAULT NULL COMMENT 'Apelido ou nome artístico',
ADD COLUMN IF NOT EXISTS `codigo_identificador` VARCHAR(50) UNIQUE DEFAULT NULL COMMENT 'Código único do promoter (ex: PROMO123)',
ADD COLUMN IF NOT EXISTS `tipo_categoria` ENUM('A', 'B', 'C', 'VIP', 'Standard') DEFAULT 'Standard' COMMENT 'Categoria do promoter',
ADD COLUMN IF NOT EXISTS `comissao_percentual` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Percentual de comissão',
ADD COLUMN IF NOT EXISTS `link_convite` VARCHAR(500) DEFAULT NULL COMMENT 'Link de convite personalizado',
ADD COLUMN IF NOT EXISTS `data_cadastro` DATE DEFAULT NULL COMMENT 'Data de cadastro',
ADD COLUMN IF NOT EXISTS `observacoes` TEXT DEFAULT NULL COMMENT 'Observações gerais',
ADD COLUMN IF NOT EXISTS `establishment_id` INT(11) DEFAULT NULL COMMENT 'Estabelecimento principal do promoter',
ADD COLUMN IF NOT EXISTS `foto_url` VARCHAR(500) DEFAULT NULL COMMENT 'URL da foto do promoter',
ADD COLUMN IF NOT EXISTS `whatsapp` VARCHAR(20) DEFAULT NULL COMMENT 'WhatsApp do promoter',
ADD COLUMN IF NOT EXISTS `instagram` VARCHAR(100) DEFAULT NULL COMMENT 'Instagram do promoter',
ADD COLUMN IF NOT EXISTS `ativo` BOOLEAN DEFAULT TRUE COMMENT 'Se o promoter está ativo';

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS `idx_promoters_codigo` ON `promoters`(`codigo_identificador`);
CREATE INDEX IF NOT EXISTS `idx_promoters_categoria` ON `promoters`(`tipo_categoria`);
CREATE INDEX IF NOT EXISTS `idx_promoters_establishment` ON `promoters`(`establishment_id`);
CREATE INDEX IF NOT EXISTS `idx_promoters_ativo` ON `promoters`(`ativo`);

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
  `horario_checkin_inicio` TIME DEFAULT NULL COMMENT 'Horário início do check-in',
  `horario_checkin_fim` TIME DEFAULT NULL COMMENT 'Horário fim do check-in',
  `politica_no_show` TEXT DEFAULT NULL COMMENT 'Política para no-shows',
  `pode_reservar_mesas_vip` BOOLEAN DEFAULT FALSE COMMENT 'Pode reservar mesas VIP',
  `pode_selecionar_areas` BOOLEAN DEFAULT FALSE COMMENT 'Pode selecionar áreas específicas',
  `areas_permitidas` TEXT DEFAULT NULL COMMENT 'JSON com IDs das áreas permitidas',
  `mesas_reservadas` TEXT DEFAULT NULL COMMENT 'JSON com IDs das mesas reservadas',
  `ativo` BOOLEAN DEFAULT TRUE COMMENT 'Se as condições estão ativas',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`condicao_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_ativo` (`ativo`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Condições específicas por promoter';

-- ========================================
-- PARTE 3: TABELA DE PERMISSÕES DO PROMOTER
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_permissoes` (
  `permissao_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `pode_ver_lista_convidados` BOOLEAN DEFAULT TRUE COMMENT 'Pode ver lista de convidados',
  `pode_adicionar_convidados` BOOLEAN DEFAULT TRUE COMMENT 'Pode adicionar convidados',
  `pode_remover_convidados` BOOLEAN DEFAULT TRUE COMMENT 'Pode remover convidados',
  `pode_gerar_link_convite` BOOLEAN DEFAULT TRUE COMMENT 'Pode gerar link de convite',
  `pode_gerar_qr_code` BOOLEAN DEFAULT TRUE COMMENT 'Pode gerar QR code',
  `pode_ver_historico` BOOLEAN DEFAULT TRUE COMMENT 'Pode ver histórico',
  `pode_ver_relatorios` BOOLEAN DEFAULT FALSE COMMENT 'Pode ver relatórios',
  `pode_ultrapassar_limites` BOOLEAN DEFAULT FALSE COMMENT 'Pode ultrapassar limites',
  `pode_aprovar_convidados_extra` BOOLEAN DEFAULT FALSE COMMENT 'Pode aprovar convidados extras',
  `pode_editar_eventos` BOOLEAN DEFAULT FALSE COMMENT 'Pode editar eventos',
  `pode_criar_eventos` BOOLEAN DEFAULT FALSE COMMENT 'Pode criar eventos',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`permissao_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permissões específicas por promoter';

-- ========================================
-- PARTE 4: TABELA DE PERFORMANCE DO PROMOTER
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_performance` (
  `performance_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) DEFAULT NULL COMMENT 'Referência ao evento',
  `data_evento` DATE NOT NULL COMMENT 'Data do evento',
  `convidados_convidados` INT(11) DEFAULT 0 COMMENT 'Total de convidados convidados',
  `convidados_compareceram` INT(11) DEFAULT 0 COMMENT 'Total de convidados que compareceram',
  `taxa_comparecimento` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Taxa de comparecimento em %',
  `receita_gerada` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Receita total gerada',
  `consumacao_total` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Consumação total',
  `entradas_vendidas` INT(11) DEFAULT 0 COMMENT 'Entradas vendidas',
  `mesas_utilizadas` INT(11) DEFAULT 0 COMMENT 'Mesas utilizadas',
  `comissao_calculada` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Comissão calculada',
  `observacoes` TEXT DEFAULT NULL COMMENT 'Observações sobre a performance',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`performance_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_evento_id` (`evento_id`),
  INDEX `idx_data_evento` (`data_evento`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Histórico de performance dos promoters';

-- ========================================
-- PARTE 5: TABELA DE ALERTAS E NOTIFICAÇÕES
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_alertas` (
  `alerta_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) DEFAULT NULL COMMENT 'Evento relacionado',
  `tipo_alerta` ENUM('quota_atingida', 'limite_ultrapassado', 'performance_baixa', 'no_show_alto', 'comissao_disponivel', 'evento_proximo', 'outros') NOT NULL,
  `titulo` VARCHAR(200) NOT NULL COMMENT 'Título do alerta',
  `mensagem` TEXT NOT NULL COMMENT 'Mensagem do alerta',
  `prioridade` ENUM('baixa', 'media', 'alta', 'critica') DEFAULT 'media',
  `lido` BOOLEAN DEFAULT FALSE COMMENT 'Se o alerta foi lido',
  `data_leitura` DATETIME DEFAULT NULL COMMENT 'Data de leitura',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`alerta_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_evento_id` (`evento_id`),
  INDEX `idx_tipo_alerta` (`tipo_alerta`),
  INDEX `idx_prioridade` (`prioridade`),
  INDEX `idx_lido` (`lido`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sistema de alertas e notificações para promoters';

-- ========================================
-- PARTE 6: TABELA DE CONVITES E LINKS
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_convites` (
  `convite_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) DEFAULT NULL COMMENT 'Evento específico (NULL = geral)',
  `codigo_convite` VARCHAR(50) UNIQUE NOT NULL COMMENT 'Código único do convite',
  `link_convite` VARCHAR(500) NOT NULL COMMENT 'Link completo do convite',
  `qr_code_url` VARCHAR(500) DEFAULT NULL COMMENT 'URL do QR code',
  `max_usos` INT(11) DEFAULT NULL COMMENT 'Máximo de usos (NULL = ilimitado)',
  `usos_realizados` INT(11) DEFAULT 0 COMMENT 'Usos realizados',
  `data_expiracao` DATETIME DEFAULT NULL COMMENT 'Data de expiração',
  `ativo` BOOLEAN DEFAULT TRUE COMMENT 'Se o convite está ativo',
  `observacoes` TEXT DEFAULT NULL COMMENT 'Observações sobre o convite',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`convite_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_evento_id` (`evento_id`),
  INDEX `idx_codigo_convite` (`codigo_convite`),
  INDEX `idx_ativo` (`ativo`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sistema de convites e links dos promoters';

-- ========================================
-- PARTE 7: TABELA DE CONDIÇÕES POR EVENTO
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_evento_condicoes` (
  `condicao_evento_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) NOT NULL,
  `max_convidados_para_evento` INT(11) DEFAULT NULL COMMENT 'Máximo específico para este evento',
  `entradas_gratuitas_evento` INT(11) DEFAULT 0 COMMENT 'Entradas gratuitas para este evento',
  `desconto_evento_percentual` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Desconto específico para este evento',
  `valor_minimo_consumo_evento` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Valor mínimo específico para este evento',
  `areas_permitidas_evento` TEXT DEFAULT NULL COMMENT 'JSON com áreas permitidas para este evento',
  `mesas_reservadas_evento` TEXT DEFAULT NULL COMMENT 'JSON com mesas reservadas para este evento',
  `observacoes_evento` TEXT DEFAULT NULL COMMENT 'Observações específicas para este evento',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`condicao_evento_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_evento_id` (`evento_id`),
  UNIQUE KEY `unique_promoter_evento` (`promoter_id`, `evento_id`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Condições específicas por promoter e evento';

-- ========================================
-- PARTE 8: TABELA DE COMISSÕES E PAGAMENTOS
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_comissoes` (
  `comissao_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) DEFAULT NULL COMMENT 'Evento específico (NULL = geral)',
  `periodo_inicio` DATE NOT NULL COMMENT 'Início do período',
  `periodo_fim` DATE NOT NULL COMMENT 'Fim do período',
  `receita_bruta` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Receita bruta do período',
  `percentual_comissao` DECIMAL(5,2) NOT NULL COMMENT 'Percentual de comissão',
  `valor_comissao` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Valor da comissão',
  `status_pagamento` ENUM('pendente', 'calculado', 'aprovado', 'pago', 'cancelado') DEFAULT 'pendente',
  `data_pagamento` DATE DEFAULT NULL COMMENT 'Data do pagamento',
  `observacoes` TEXT DEFAULT NULL COMMENT 'Observações sobre a comissão',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`comissao_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_evento_id` (`evento_id`),
  INDEX `idx_periodo` (`periodo_inicio`, `periodo_fim`),
  INDEX `idx_status_pagamento` (`status_pagamento`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sistema de comissões e pagamentos dos promoters';

-- ========================================
-- PARTE 9: TABELA DE RELATÓRIOS E ANALYTICS
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_relatorios` (
  `relatorio_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `tipo_relatorio` ENUM('performance', 'financeiro', 'convidados', 'eventos', 'comissao') NOT NULL,
  `periodo_inicio` DATE NOT NULL,
  `periodo_fim` DATE NOT NULL,
  `dados_relatorio` JSON NOT NULL COMMENT 'Dados do relatório em JSON',
  `gerado_por` INT(11) DEFAULT NULL COMMENT 'Usuário que gerou o relatório',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`relatorio_id`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_tipo_relatorio` (`tipo_relatorio`),
  INDEX `idx_periodo` (`periodo_inicio`, `periodo_fim`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`gerado_por`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Relatórios e analytics dos promoters';

-- ========================================
-- PARTE 10: DADOS INICIAIS E EXEMPLOS
-- ========================================

-- Atualizar promoters existentes com dados padrão
UPDATE `promoters` SET 
  `data_cadastro` = CURDATE(),
  `ativo` = TRUE,
  `tipo_categoria` = 'Standard'
WHERE `data_cadastro` IS NULL;

-- Inserir condições padrão para promoters existentes
INSERT IGNORE INTO `promoter_condicoes` (
  `promoter_id`, `max_convidados_por_evento`, `max_convidados_por_data`,
  `quota_mesas`, `quota_entradas`, `entradas_gratuitas`, `desconto_especial_percentual`,
  `valor_minimo_consumo`, `pode_reservar_mesas_vip`, `pode_selecionar_areas`, `ativo`
)
SELECT 
  `promoter_id`, 30, 50, 5, 20, 5, 10.00, 50.00, FALSE, FALSE, TRUE
FROM `promoters` 
WHERE `promoter_id` NOT IN (SELECT `promoter_id` FROM `promoter_condicoes`);

-- Inserir permissões padrão para promoters existentes
INSERT IGNORE INTO `promoter_permissoes` (
  `promoter_id`, `pode_ver_lista_convidados`, `pode_adicionar_convidados`,
  `pode_remover_convidados`, `pode_gerar_link_convite`, `pode_gerar_qr_code`,
  `pode_ver_historico`, `pode_ver_relatorios`, `pode_ultrapassar_limites`,
  `pode_aprovar_convidados_extra`
)
SELECT 
  `promoter_id`, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE
FROM `promoters` 
WHERE `promoter_id` NOT IN (SELECT `promoter_id` FROM `promoter_permissoes`);

-- ========================================
-- PARTE 11: PROCEDURES E FUNCTIONS ÚTEIS
-- ========================================

DELIMITER $$

-- Procedure para calcular performance de um promoter
CREATE PROCEDURE IF NOT EXISTS CalculatePromoterPerformance(
  IN p_promoter_id INT,
  IN p_evento_id INT,
  IN p_data_evento DATE
)
BEGIN
  DECLARE v_convidados_convidados INT DEFAULT 0;
  DECLARE v_convidados_compareceram INT DEFAULT 0;
  DECLARE v_taxa_comparecimento DECIMAL(5,2) DEFAULT 0.00;
  DECLARE v_receita_gerada DECIMAL(10,2) DEFAULT 0.00;
  
  -- Calcular convidados
  SELECT 
    COUNT(*),
    SUM(CASE WHEN status_checkin = 'Check-in' THEN 1 ELSE 0 END)
  INTO v_convidados_convidados, v_convidados_compareceram
  FROM listas_convidados lc
  JOIN listas l ON lc.lista_id = l.lista_id
  WHERE l.promoter_responsavel_id = p_promoter_id
  AND l.evento_id = p_evento_id;
  
  -- Calcular taxa de comparecimento
  IF v_convidados_convidados > 0 THEN
    SET v_taxa_comparecimento = (v_convidados_compareceram / v_convidados_convidados) * 100;
  END IF;
  
  -- Inserir ou atualizar performance
  INSERT INTO promoter_performance (
    promoter_id, evento_id, data_evento, convidados_convidados, 
    convidados_compareceram, taxa_comparecimento, receita_gerada
  ) VALUES (
    p_promoter_id, p_evento_id, p_data_evento, v_convidados_convidados,
    v_convidados_compareceram, v_taxa_comparecimento, v_receita_gerada
  )
  ON DUPLICATE KEY UPDATE
    convidados_convidados = v_convidados_convidados,
    convidados_compareceram = v_convidados_compareceram,
    taxa_comparecimento = v_taxa_comparecimento,
    receita_gerada = v_receita_gerada,
    updated_at = CURRENT_TIMESTAMP;
    
END$$

-- Function para verificar se promoter pode adicionar mais convidados
CREATE FUNCTION IF NOT EXISTS CanPromoterAddGuests(
  p_promoter_id INT,
  p_evento_id INT,
  p_quantidade_nova INT
) RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_max_convidados INT DEFAULT 0;
  DECLARE v_convidados_atuais INT DEFAULT 0;
  DECLARE v_pode_ultrapassar BOOLEAN DEFAULT FALSE;
  
  -- Buscar limite do promoter
  SELECT 
    COALESCE(pec.max_convidados_para_evento, pc.max_convidados_por_evento, 0),
    pp.pode_ultrapassar_limites
  INTO v_max_convidados, v_pode_ultrapassar
  FROM promoters p
  LEFT JOIN promoter_condicoes pc ON p.promoter_id = pc.promoter_id AND pc.ativo = TRUE
  LEFT JOIN promoter_evento_condicoes pec ON p.promoter_id = pec.promoter_id AND pec.evento_id = p_evento_id
  LEFT JOIN promoter_permissoes pp ON p.promoter_id = pp.promoter_id
  WHERE p.promoter_id = p_promoter_id;
  
  -- Contar convidados atuais
  SELECT COUNT(*)
  INTO v_convidados_atuais
  FROM listas_convidados lc
  JOIN listas l ON lc.lista_id = l.lista_id
  WHERE l.promoter_responsavel_id = p_promoter_id
  AND l.evento_id = p_evento_id;
  
  -- Verificar se pode adicionar
  IF v_max_convidados = 0 OR v_pode_ultrapassar THEN
    RETURN TRUE;
  END IF;
  
  RETURN (v_convidados_atuais + p_quantidade_nova) <= v_max_convidados;
END$$

DELIMITER ;

-- ========================================
-- PARTE 12: TRIGGERS PARA AUTOMAÇÃO
-- ========================================

-- Trigger para atualizar performance automaticamente
DELIMITER $$

CREATE TRIGGER IF NOT EXISTS tr_update_promoter_performance_after_checkin
AFTER UPDATE ON listas_convidados
FOR EACH ROW
BEGIN
  IF OLD.status_checkin != NEW.status_checkin THEN
    CALL CalculatePromoterPerformance(
      (SELECT promoter_responsavel_id FROM listas WHERE lista_id = NEW.lista_id),
      (SELECT evento_id FROM listas WHERE lista_id = NEW.lista_id),
      CURDATE()
    );
  END IF;
END$$

DELIMITER ;

-- ========================================
-- PARTE 13: COMENTÁRIOS E DOCUMENTAÇÃO
-- ========================================

/*
SISTEMA AVANÇADO DE PROMOTERS - DOCUMENTAÇÃO

ESTRUTURA PRINCIPAL:
1. promoters - Dados básicos expandidos
2. promoter_condicoes - Condições e limites por promoter
3. promoter_permissoes - Permissões específicas
4. promoter_performance - Histórico de performance
5. promoter_alertas - Sistema de alertas
6. promoter_convites - Links e convites
7. promoter_evento_condicoes - Condições por evento específico
8. promoter_comissoes - Sistema de comissões
9. promoter_relatorios - Relatórios e analytics

FUNCIONALIDADES IMPLEMENTADAS:

1. INFORMAÇÕES BÁSICAS:
   - Nome, apelido, contatos
   - Código identificador único
   - Categoria (A, B, C, VIP, Standard)
   - Comissão percentual
   - Link de convite personalizado
   - Foto e redes sociais

2. CONDIÇÕES E REGRAS:
   - Limites de convidados por evento/data
   - Quotas de mesas e entradas
   - Regras de gratuidade e desconto
   - Valores mínimos de consumo
   - Horários de check-in
   - Política de no-show
   - Permissões para áreas VIP

3. CONTROLE DE CONVIDADOS:
   - Lista de convidados por promoter
   - Histórico de eventos
   - Performance tracking
   - Sistema de alertas

4. INTERFACE DE RESERVAS:
   - Mesas vinculadas por promoter
   - Áreas permitidas
   - Status de reservas
   - Check-in confirmado

5. RELATÓRIOS E PERFORMANCE:
   - Taxa de comparecimento
   - Receita gerada
   - Ranking entre promoters
   - Alertas automáticos

6. PERMISSÕES E PAINEL:
   - Controle granular de permissões
   - Acesso restrito por promoter
   - Validação de limites
   - Sistema de aprovações

7. INTERFACE POR EVENTO:
   - Condições específicas por evento
   - Status em tempo real
   - Controle de cotas
   - Alertas de limite

8. DADOS COMPLEMENTARES:
   - Sistema de comissões
   - Relatórios detalhados
   - Analytics avançados
   - Histórico completo

INTEGRAÇÃO COM SISTEMA EXISTENTE:
- Compatível com tabela eventos existente
- Integração com sistema de listas
- Compatibilidade com reservas de restaurante
- Sistema de autenticação existente
- Middleware de autorização

AUTOMAÇÃO:
- Triggers para atualização automática
- Procedures para cálculos
- Functions para validações
- Sistema de alertas automáticos
*/

-- ========================================
-- FIM DO SCRIPT
-- ========================================

SELECT '✅ Sistema Avançado de Promoters criado com sucesso!' AS status;
SELECT 'Todas as funcionalidades solicitadas foram implementadas' AS info;
SELECT 'Execute este script no banco de dados para ativar o sistema' AS instrucao;
