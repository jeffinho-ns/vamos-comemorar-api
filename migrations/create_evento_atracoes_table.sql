-- ========================================
-- TABELA DE ATRAÇÕES DOS EVENTOS
-- Armazena as atrações que vão se apresentar em cada evento
-- Data: 2025-01-27
-- ========================================

CREATE TABLE IF NOT EXISTS evento_atracoes (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL,
  nome_atracao VARCHAR(255) NOT NULL,
  ambiente VARCHAR(255) NOT NULL,
  horario_inicio TIME NOT NULL,
  horario_termino TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evento_atracoes_evento FOREIGN KEY (evento_id) 
    REFERENCES eventos(id) ON DELETE CASCADE
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_evento_atracoes_evento_id ON evento_atracoes(evento_id);
CREATE INDEX IF NOT EXISTS idx_evento_atracoes_horario_inicio ON evento_atracoes(horario_inicio);

-- Trigger para atualizar updated_at automaticamente
-- Nota: A função trigger_set_timestamp() deve existir no banco
-- Se não existir, execute primeiro: migrations/postgresql_triggers_and_functions.sql
DROP TRIGGER IF EXISTS set_timestamp_evento_atracoes ON evento_atracoes;
CREATE TRIGGER set_timestamp_evento_atracoes
  BEFORE UPDATE ON evento_atracoes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Comentários
COMMENT ON TABLE evento_atracoes IS 'Armazena as atrações que vão se apresentar em cada evento';
COMMENT ON COLUMN evento_atracoes.evento_id IS 'ID do evento ao qual a atração pertence';
COMMENT ON COLUMN evento_atracoes.nome_atracao IS 'Nome da atração/artista';
COMMENT ON COLUMN evento_atracoes.ambiente IS 'Ambiente/local onde a atração vai se apresentar';
COMMENT ON COLUMN evento_atracoes.horario_inicio IS 'Horário de início da apresentação';
COMMENT ON COLUMN evento_atracoes.horario_termino IS 'Horário de término da apresentação';

