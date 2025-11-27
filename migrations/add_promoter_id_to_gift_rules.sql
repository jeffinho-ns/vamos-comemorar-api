-- Migração para adicionar campo promoter_id na tabela gift_rules
-- Permite criar regras de brinde específicas para cada promoter

-- Adicionar coluna promoter_id na tabela gift_rules
ALTER TABLE gift_rules 
ADD COLUMN IF NOT EXISTS promoter_id INTEGER NULL DEFAULT NULL;

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_gift_rules_promoter_id ON gift_rules(promoter_id);

-- Adicionar foreign key (pode ser NULL para regras gerais)
-- Não adicionamos constraint de foreign key para permitir que seja NULL (regras gerais)

-- Comentário
COMMENT ON COLUMN gift_rules.promoter_id IS 'ID do promoter específico (NULL = regra geral para todos os promoters do estabelecimento)';

