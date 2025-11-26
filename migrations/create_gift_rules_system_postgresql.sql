-- Sistema de Regras de Brindes para Reservas de Restaurante
-- Versão PostgreSQL - Execute esta migração no banco de dados PostgreSQL
-- Esta tabela armazena regras configuráveis de brindes por estabelecimento/evento

-- Tabela de regras de brindes
CREATE TABLE IF NOT EXISTS gift_rules (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  evento_id INTEGER NULL DEFAULT NULL,
  descricao VARCHAR(255) NOT NULL,
  checkins_necessarios INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'INATIVA')),
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_gift_rules_establishment ON gift_rules(establishment_id);
CREATE INDEX IF NOT EXISTS idx_gift_rules_evento ON gift_rules(evento_id);
CREATE INDEX IF NOT EXISTS idx_gift_rules_status ON gift_rules(status);

-- Comentários nas colunas
COMMENT ON TABLE gift_rules IS 'Regras de brindes configuráveis por estabelecimento/evento';
COMMENT ON COLUMN gift_rules.establishment_id IS 'ID do estabelecimento';
COMMENT ON COLUMN gift_rules.evento_id IS 'ID do evento (opcional - NULL significa válido para todos os eventos)';
COMMENT ON COLUMN gift_rules.descricao IS 'Descrição do brinde (ex: "1 drink", "4 cervejas")';
COMMENT ON COLUMN gift_rules.checkins_necessarios IS 'Quantidade de check-ins necessários para liberar o brinde';
COMMENT ON COLUMN gift_rules.status IS 'Status da regra (ATIVA ou INATIVA)';

-- Tabela para armazenar brindes liberados por guest list/reserva
CREATE TABLE IF NOT EXISTS guest_list_gifts (
  id SERIAL PRIMARY KEY,
  guest_list_id INTEGER NOT NULL,
  gift_rule_id INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'LIBERADO' CHECK (status IN ('LIBERADO', 'ENTREGUE', 'CANCELADO')),
  checkins_count INTEGER NOT NULL,
  liberado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  entregue_em TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_gift_guest_list FOREIGN KEY (guest_list_id) REFERENCES guest_lists(id) ON DELETE CASCADE,
  CONSTRAINT fk_gift_rule FOREIGN KEY (gift_rule_id) REFERENCES gift_rules(id) ON DELETE CASCADE
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_guest_list_gifts_guest_list ON guest_list_gifts(guest_list_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_gifts_gift_rule ON guest_list_gifts(gift_rule_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_gifts_status ON guest_list_gifts(status);

-- Constraint única para evitar duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_list_gift_rule_status 
ON guest_list_gifts(guest_list_id, gift_rule_id) 
WHERE status != 'CANCELADO';

-- Comentários
COMMENT ON TABLE guest_list_gifts IS 'Brindes liberados para cada guest list';
COMMENT ON COLUMN guest_list_gifts.guest_list_id IS 'ID da guest list';
COMMENT ON COLUMN guest_list_gifts.gift_rule_id IS 'ID da regra de brinde que foi atingida';
COMMENT ON COLUMN guest_list_gifts.status IS 'Status do brinde (LIBERADO, ENTREGUE ou CANCELADO)';
COMMENT ON COLUMN guest_list_gifts.checkins_count IS 'Quantidade de check-ins quando foi liberado';
COMMENT ON COLUMN guest_list_gifts.liberado_em IS 'Data/hora em que o brinde foi liberado';
COMMENT ON COLUMN guest_list_gifts.entregue_em IS 'Data/hora em que o brinde foi entregue';

-- Criar trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger na tabela gift_rules
DROP TRIGGER IF EXISTS update_gift_rules_updated_at ON gift_rules;
CREATE TRIGGER update_gift_rules_updated_at
    BEFORE UPDATE ON gift_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
