SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS agent_conversation_context (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  context_summary TEXT NOT NULL DEFAULT '',
  working_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_agent_conversation_context_conversation UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_conversation_context_updated
  ON agent_conversation_context (updated_at DESC);

CREATE TABLE IF NOT EXISTS establishment_faq (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  topic VARCHAR(64) NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_establishment_faq_topic
  ON establishment_faq (establishment_id, topic);

CREATE INDEX IF NOT EXISTS idx_establishment_faq_establishment
  ON establishment_faq (establishment_id, is_active);

INSERT INTO establishment_faq (establishment_id, topic, answer)
SELECT 9, 'estacionamento', 'A orientação de estacionamento pode variar conforme o dia e o evento. Posso confirmar com a equipe da casa no dia da reserva.'
WHERE NOT EXISTS (
  SELECT 1 FROM establishment_faq WHERE establishment_id = 9 AND topic = 'estacionamento'
);

INSERT INTO establishment_faq (establishment_id, topic, answer)
SELECT 9, 'pet', 'A política de pets pode variar conforme a casa e o evento. Posso confirmar a orientação com a equipe no dia da reserva.'
WHERE NOT EXISTS (
  SELECT 1 FROM establishment_faq WHERE establishment_id = 9 AND topic = 'pet'
);

INSERT INTO establishment_faq (establishment_id, topic, answer)
SELECT 9, 'musica', 'A programação musical pode variar conforme evento e operação do dia. Posso alinhar o estilo do dia quando você confirmar a data.'
WHERE NOT EXISTS (
  SELECT 1 FROM establishment_faq WHERE establishment_id = 9 AND topic = 'musica'
);

INSERT INTO establishment_faq (establishment_id, topic, answer)
SELECT 9, 'cardapio', 'O cardápio digital está em https://www.agilizaiapp.com.br/cardapio/reserva-rooftop'
WHERE NOT EXISTS (
  SELECT 1 FROM establishment_faq WHERE establishment_id = 9 AND topic = 'cardapio'
);
