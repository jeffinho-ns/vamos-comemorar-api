-- =====================================================
-- MIGRAÇÃO: Adicionar campos de Status de Entrada
-- Data: 2025-01-27
-- Descrição: Adiciona campos para controlar tipo e valor de entrada no check-in
-- =====================================================

-- 1. Adicionar campos na tabela CONVIDADOS (reservas de mesa)
ALTER TABLE `convidados` 
ADD COLUMN IF NOT EXISTS `entrada_tipo` ENUM('VIP', 'SECO', 'CONSUMA') DEFAULT NULL COMMENT 'Tipo de entrada: VIP (grátis), SECO (sem consumação), CONSUMA (com consumação)',
ADD COLUMN IF NOT EXISTS `entrada_valor` DECIMAL(10,2) DEFAULT NULL COMMENT 'Valor pago na entrada';

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS `idx_entrada_tipo` ON `convidados`(`entrada_tipo`);
CREATE INDEX IF NOT EXISTS `idx_entrada_valor` ON `convidados`(`entrada_valor`);

-- 2. Adicionar campos na tabela LISTAS_CONVIDADOS (convidados de promoters)
ALTER TABLE `listas_convidados` 
ADD COLUMN IF NOT EXISTS `entrada_tipo` ENUM('VIP', 'SECO', 'CONSUMA') DEFAULT NULL COMMENT 'Tipo de entrada: VIP (grátis), SECO (sem consumação), CONSUMA (com consumação)',
ADD COLUMN IF NOT EXISTS `entrada_valor` DECIMAL(10,2) DEFAULT NULL COMMENT 'Valor pago na entrada';

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS `idx_entrada_tipo` ON `listas_convidados`(`entrada_tipo`);
CREATE INDEX IF NOT EXISTS `idx_entrada_valor` ON `listas_convidados`(`entrada_valor`);

-- =====================================================
-- VALIDAÇÃO: Verificar se os campos foram criados
-- =====================================================
SELECT 
    'convidados' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'convidados'
AND COLUMN_NAME IN ('entrada_tipo', 'entrada_valor')
UNION ALL
SELECT 
    'listas_convidados' as tabela,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'listas_convidados'
AND COLUMN_NAME IN ('entrada_tipo', 'entrada_valor');

-- =====================================================
-- COMENTÁRIOS SOBRE AS REGRAS DE NEGÓCIO
-- =====================================================
-- Regras de entrada baseadas no horário:
-- - Até 22:00: VIP (grátis) - automático
-- - 22:00 até 00:30: R$ 40 SECO ou R$ 120 CONSUMA - escolha do admin
-- - Após 00:30: R$ 50 SECO ou R$ 150 CONSUMA - escolha do admin
-- - Entre 22:00 e 03:00: Admin pode forçar VIP manualmente
-- =====================================================

