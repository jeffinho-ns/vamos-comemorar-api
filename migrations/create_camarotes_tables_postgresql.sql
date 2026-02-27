-- Migração para criar tabelas de camarotes e reservas de camarotes
-- Execute este script no seu banco PostgreSQL (Render)
--
-- IMPORTANTE: Execute no schema correto do seu banco. Exemplo:
--   SET search_path TO meu_backup_db, public;
--   \i migrations/create_camarotes_tables_postgresql.sql

-- Criar tabela de camarotes
CREATE TABLE IF NOT EXISTS camarotes (
  id SERIAL PRIMARY KEY,
  id_place INTEGER NOT NULL,
  nome_camarote VARCHAR(255) NOT NULL,
  capacidade_maxima INTEGER NOT NULL DEFAULT 10,
  status VARCHAR(50) DEFAULT 'disponivel' CHECK (status IN ('disponivel','bloqueado','reservado')),
  regras_especificas TEXT DEFAULT NULL,
  valor_base DECIMAL(10,2) DEFAULT 0.00,
  descricao TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_camarotes_id_place ON camarotes(id_place);
CREATE INDEX IF NOT EXISTS idx_camarotes_status ON camarotes(status);
CREATE INDEX IF NOT EXISTS idx_camarotes_place_status ON camarotes(id_place, status);

-- Adicionar colunas que possam faltar se a tabela já existir
ALTER TABLE camarotes ADD COLUMN IF NOT EXISTS regras_especificas TEXT DEFAULT NULL;
ALTER TABLE camarotes ADD COLUMN IF NOT EXISTS valor_base DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE camarotes ADD COLUMN IF NOT EXISTS descricao TEXT DEFAULT NULL;
ALTER TABLE camarotes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE camarotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Criar tabela de reservas de camarotes (ou adicionar colunas ausentes se já existir)
CREATE TABLE IF NOT EXISTS reservas_camarote (
  id SERIAL PRIMARY KEY,
  id_reserva INTEGER DEFAULT NULL,
  id_camarote INTEGER NOT NULL,
  id_evento INTEGER DEFAULT NULL,
  nome_cliente VARCHAR(255) NOT NULL,
  telefone VARCHAR(20) DEFAULT NULL,
  cpf_cnpj VARCHAR(20) DEFAULT NULL,
  email VARCHAR(255) DEFAULT NULL,
  data_nascimento DATE DEFAULT NULL,
  maximo_pessoas INTEGER NOT NULL,
  entradas_unisex_free INTEGER DEFAULT 0,
  entradas_masculino_free INTEGER DEFAULT 0,
  entradas_feminino_free INTEGER DEFAULT 0,
  valor_camarote DECIMAL(10,2) DEFAULT 0.00,
  valor_consumacao DECIMAL(10,2) DEFAULT 0.00,
  valor_pago DECIMAL(10,2) DEFAULT 0.00,
  valor_sinal DECIMAL(10,2) DEFAULT 0.00,
  prazo_sinal_dias INTEGER DEFAULT 0,
  solicitado_por VARCHAR(255) DEFAULT NULL,
  observacao TEXT DEFAULT NULL,
  status_reserva VARCHAR(50) DEFAULT 'pre-reservado',
  tag VARCHAR(100) DEFAULT NULL,
  hora_reserva TIME DEFAULT NULL,
  data_reserva DATE DEFAULT NULL,
  data_expiracao DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Adicionar colunas que possam faltar em tabelas já existentes
ALTER TABLE reservas_camarote ADD COLUMN IF NOT EXISTS id_evento INTEGER DEFAULT NULL;
ALTER TABLE reservas_camarote ADD COLUMN IF NOT EXISTS restaurant_reservation_id INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_reservas_camarote_id_camarote ON reservas_camarote(id_camarote);
CREATE INDEX IF NOT EXISTS idx_reservas_camarote_id_evento ON reservas_camarote(id_evento);
CREATE INDEX IF NOT EXISTS idx_reservas_camarote_status ON reservas_camarote(status_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_camarote_data ON reservas_camarote(data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_camarote_camarote_status ON reservas_camarote(id_camarote, status_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_camarote_data_status ON reservas_camarote(data_reserva, status_reserva);

-- Criar tabela de convidados dos camarotes
CREATE TABLE IF NOT EXISTS camarote_convidados (
  id SERIAL PRIMARY KEY,
  id_reserva_camarote INTEGER NOT NULL,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  telefone VARCHAR(20) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('confirmado','pendente','cancelado')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_camarote_convidados_reserva ON camarote_convidados(id_reserva_camarote);

-- Inserir camarotes para o High Line (id_place = 7) - apenas Highline Lounge 30 a 35
INSERT INTO camarotes (id, id_place, nome_camarote, capacidade_maxima, status, regras_especificas, valor_base, descricao)
VALUES
  (101, 7, 'Highline Lounge 30', 10, 'disponivel', 'Camarote Highline Lounge', 500.00, 'Highline Lounge 30'),
  (102, 7, 'Highline Lounge 31', 10, 'disponivel', 'Camarote Highline Lounge', 500.00, 'Highline Lounge 31'),
  (103, 7, 'Highline Lounge 32', 10, 'disponivel', 'Camarote Highline Lounge', 500.00, 'Highline Lounge 32'),
  (104, 7, 'Highline Lounge 33', 10, 'disponivel', 'Camarote Highline Lounge', 500.00, 'Highline Lounge 33'),
  (105, 7, 'Highline Lounge 34', 10, 'disponivel', 'Camarote Highline Lounge', 500.00, 'Highline Lounge 34'),
  (106, 7, 'Highline Lounge 35', 10, 'disponivel', 'Camarote Highline Lounge', 500.00, 'Highline Lounge 35')
ON CONFLICT (id) DO UPDATE SET
  nome_camarote = EXCLUDED.nome_camarote,
  descricao = EXCLUDED.descricao,
  regras_especificas = EXCLUDED.regras_especificas,
  updated_at = CURRENT_TIMESTAMP;
