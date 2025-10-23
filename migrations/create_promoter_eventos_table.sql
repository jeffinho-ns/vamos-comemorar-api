-- ========================================
-- TABELA DE RELACIONAMENTO PROMOTER ↔ EVENTOS
-- Permite múltiplos promoters por evento
-- Data: 2025-01-27
-- ========================================

CREATE TABLE IF NOT EXISTS `promoter_eventos` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `promoter_id` INT(11) NOT NULL,
  `evento_id` INT(11) NOT NULL,
  `data_evento` DATE NOT NULL COMMENT 'Data específica do evento (para eventos semanais)',
  `status` ENUM('ativo', 'inativo', 'cancelado') DEFAULT 'ativo',
  `funcao` ENUM('responsavel', 'co-promoter', 'backup') DEFAULT 'responsavel',
  `observacoes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_promoter_evento_data` (`promoter_id`, `evento_id`, `data_evento`),
  INDEX `idx_promoter_id` (`promoter_id`),
  INDEX `idx_evento_id` (`evento_id`),
  INDEX `idx_data_evento` (`data_evento`),
  INDEX `idx_status` (`status`),
  FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`promoter_id`) ON DELETE CASCADE,
  FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Relacionamento entre promoters e eventos com suporte a múltiplos promoters por evento';

-- ========================================
-- INSERIR DADOS EXISTENTES
-- ========================================

-- Migrar promoters existentes que já estão vinculados a eventos
INSERT INTO `promoter_eventos` (`promoter_id`, `evento_id`, `data_evento`, `status`, `funcao`)
SELECT 
  e.promoter_criador_id as promoter_id,
  e.id as evento_id,
  COALESCE(e.data_do_evento, CURDATE()) as data_evento,
  'ativo' as status,
  'responsavel' as funcao
FROM eventos e
WHERE e.promoter_criador_id IS NOT NULL
AND e.usado_para_listas = TRUE
ON DUPLICATE KEY UPDATE status = 'ativo';

-- ========================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ========================================

/*
ESTRUTURA DA TABELA:

1. promoter_id: ID do promoter
2. evento_id: ID do evento (único ou semanal)
3. data_evento: Data específica (importante para eventos semanais)
4. status: ativo/inativo/cancelado
5. funcao: responsavel/co-promoter/backup

CASOS DE USO:

EVENTOS ÚNICOS:
- Um evento único pode ter múltiplos promoters
- Cada promoter tem uma data específica (mesma data do evento)

EVENTOS SEMANAIS:
- Um evento semanal pode ter diferentes promoters para diferentes datas
- Ex: Promoter A trabalha às segundas, Promoter B às sextas
- Cada linha representa uma data específica

EXEMPLOS:

Evento Único "Festa de Aniversário":
- promoter_id: 1, evento_id: 5, data_evento: '2025-02-14', funcao: 'responsavel'
- promoter_id: 2, evento_id: 5, data_evento: '2025-02-14', funcao: 'co-promoter'

Evento Semanal "Sexta da Balada":
- promoter_id: 1, evento_id: 3, data_evento: '2025-01-31', funcao: 'responsavel'
- promoter_id: 1, evento_id: 3, data_evento: '2025-02-07', funcao: 'responsavel'
- promoter_id: 2, evento_id: 3, data_evento: '2025-02-14', funcao: 'responsavel'
*/
