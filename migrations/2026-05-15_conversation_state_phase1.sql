-- Fase 1: máquina de estados persistida para fluxo de reservas via WhatsApp.
-- Execute no PostgreSQL antes do deploy da API.

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS conversation_state (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id INTEGER NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wa_id VARCHAR(32) NOT NULL,
  current_step VARCHAR(64) NOT NULL DEFAULT 'greeting',
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  collected_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  reservation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_question TEXT,
  last_intent VARCHAR(64),
  handoff_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  state_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_conversation_state_conversation UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_state_wa_id
  ON conversation_state (wa_id);

CREATE INDEX IF NOT EXISTS idx_conversation_state_current_step
  ON conversation_state (current_step, updated_at DESC);

COMMENT ON TABLE conversation_state IS
  'Estado persistido da máquina de estados do fluxo conversacional de reservas';

COMMENT ON COLUMN conversation_state.collected_fields IS
  'Slots já validados pelo backend (fonte de verdade operacional)';

COMMENT ON COLUMN conversation_state.missing_fields IS
  'Lista de chaves ainda pendentes para concluir a reserva';

COMMENT ON COLUMN conversation_state.reservation_context IS
  'Metadados operacionais da reserva em andamento (estabelecimento fixo, hints, etc.)';
