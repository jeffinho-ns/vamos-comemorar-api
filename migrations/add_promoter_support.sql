-- Migração para adicionar suporte a promoters na tabela eventos
-- Execute este script no banco de dados para adicionar as colunas necessárias

-- Adicionar coluna criado_por na tabela eventos
ALTER TABLE eventos ADD COLUMN criado_por INT;

-- Adicionar foreign key para criado_por
ALTER TABLE eventos ADD FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL;

-- Adicionar coluna promoter_id na tabela eventos
ALTER TABLE eventos ADD COLUMN promoter_id INT;

-- Adicionar foreign key para promoter_id
ALTER TABLE eventos ADD FOREIGN KEY (promoter_id) REFERENCES users(id) ON DELETE SET NULL;

-- Comentários sobre a estrutura:
-- criado_por: ID do usuário que criou o evento
-- promoter_id: ID do usuário que é o promoter principal do evento
-- Um usuário pode ser promoter se:
-- 1. É o criador do evento (criado_por)
-- 2. É o promoter designado (promoter_id)
-- 3. Tem reservas associadas ao evento 