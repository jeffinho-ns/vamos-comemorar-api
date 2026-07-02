-- Marcação de conversas lidas por operador (inbox admin).

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS whatsapp_inbox_read_state (
  user_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  last_read_message_id BIGINT,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_read_state_user
  ON whatsapp_inbox_read_state (user_id, last_read_at DESC);

COMMENT ON TABLE whatsapp_inbox_read_state IS 'Última mensagem vista por operador no inbox WhatsApp';
