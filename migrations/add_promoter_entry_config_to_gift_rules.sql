-- Migração: configuração de cobrança por horário para regras de promoter
-- Adiciona coluna JSONB com janelas de entrada/couvert exibidas no check-in

ALTER TABLE gift_rules
  ADD COLUMN IF NOT EXISTS entrada_config JSONB NULL;

COMMENT ON COLUMN gift_rules.entrada_config IS
'Configuração de entrada por horário para promoter (couvert/faixa_1/faixa_2), usada no modal de check-in.';
