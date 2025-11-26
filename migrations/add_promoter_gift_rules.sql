-- Migração para adicionar suporte a regras de brindes para promoters
-- Adiciona campo tipo_beneficiario na tabela gift_rules
-- Cria tabela promoter_gifts para armazenar brindes liberados para promoters

-- 1. Adicionar coluna tipo_beneficiario na tabela gift_rules
ALTER TABLE gift_rules 
ADD COLUMN IF NOT EXISTS tipo_beneficiario VARCHAR(20) DEFAULT 'ANIVERSARIO' 
CHECK (tipo_beneficiario IN ('ANIVERSARIO', 'PROMOTER'));

-- Atualizar registros existentes para ANIVERSARIO
UPDATE gift_rules SET tipo_beneficiario = 'ANIVERSARIO' WHERE tipo_beneficiario IS NULL;

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_gift_rules_tipo_beneficiario ON gift_rules(tipo_beneficiario);

-- 2. Criar tabela para armazenar brindes liberados para promoters
CREATE TABLE IF NOT EXISTS promoter_gifts (
  id SERIAL PRIMARY KEY,
  promoter_id INTEGER NOT NULL,
  evento_id INTEGER NOT NULL,
  gift_rule_id INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'LIBERADO' CHECK (status IN ('LIBERADO', 'ENTREGUE', 'CANCELADO')),
  checkins_count INTEGER NOT NULL,
  liberado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  entregue_em TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_promoter_gift_promoter FOREIGN KEY (promoter_id) REFERENCES promoters(promoter_id) ON DELETE CASCADE,
  CONSTRAINT fk_promoter_gift_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
  CONSTRAINT fk_promoter_gift_rule FOREIGN KEY (gift_rule_id) REFERENCES gift_rules(id) ON DELETE CASCADE
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_promoter_gifts_promoter ON promoter_gifts(promoter_id);
CREATE INDEX IF NOT EXISTS idx_promoter_gifts_evento ON promoter_gifts(evento_id);
CREATE INDEX IF NOT EXISTS idx_promoter_gifts_gift_rule ON promoter_gifts(gift_rule_id);
CREATE INDEX IF NOT EXISTS idx_promoter_gifts_status ON promoter_gifts(status);

-- Constraint única para evitar duplicatas do mesmo brinde para o mesmo promoter/evento
CREATE UNIQUE INDEX IF NOT EXISTS uq_promoter_gift_promoter_evento_rule 
ON promoter_gifts(promoter_id, evento_id, gift_rule_id) 
WHERE status != 'CANCELADO';

-- Comentários
COMMENT ON COLUMN gift_rules.tipo_beneficiario IS 'Tipo de beneficiário da regra: ANIVERSARIO ou PROMOTER';
COMMENT ON TABLE promoter_gifts IS 'Brindes liberados para promoters por evento';
COMMENT ON COLUMN promoter_gifts.promoter_id IS 'ID do promoter';
COMMENT ON COLUMN promoter_gifts.evento_id IS 'ID do evento';
COMMENT ON COLUMN promoter_gifts.gift_rule_id IS 'ID da regra de brinde que foi atingida';
COMMENT ON COLUMN promoter_gifts.status IS 'Status do brinde (LIBERADO, ENTREGUE ou CANCELADO)';
COMMENT ON COLUMN promoter_gifts.checkins_count IS 'Quantidade de check-ins quando foi liberado';
COMMENT ON COLUMN promoter_gifts.liberado_em IS 'Data/hora em que o brinde foi liberado';
COMMENT ON COLUMN promoter_gifts.entregue_em IS 'Data/hora em que o brinde foi entregue';

