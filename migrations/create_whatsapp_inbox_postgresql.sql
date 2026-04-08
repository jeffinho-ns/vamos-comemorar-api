-- Central de Atendimento WhatsApp: conversas, mensagens e handoff humano
-- Execute no PostgreSQL (Render / produção) antes de usar o inbox no admin.

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id SERIAL PRIMARY KEY,
  wa_id VARCHAR(32) NOT NULL UNIQUE,
  contact_name VARCHAR(255),
  human_takeover_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_updated
  ON whatsapp_conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  intent VARCHAR(64),
  suggested_reply TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_created
  ON whatsapp_messages (conversation_id, created_at DESC);

COMMENT ON TABLE whatsapp_conversations IS 'Threads WhatsApp Cloud API por wa_id';
COMMENT ON TABLE whatsapp_messages IS 'Mensagens inbound/outbound com metadados de IA';
