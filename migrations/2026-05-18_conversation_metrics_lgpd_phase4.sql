-- Fase 4: eventos granulares de funil conversacional e suporte LGPD.
-- Execute no PostgreSQL antes do deploy da API.

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS conversation_funnel_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  conversation_id INTEGER REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  session_id UUID,
  wa_id VARCHAR(32),
  establishment_id INTEGER,
  step VARCHAR(64),
  previous_step VARCHAR(64),
  retry_count INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_funnel_events_occurred
  ON conversation_funnel_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_funnel_events_type_occurred
  ON conversation_funnel_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_funnel_events_step_occurred
  ON conversation_funnel_events (step, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_funnel_events_establishment_occurred
  ON conversation_funnel_events (establishment_id, occurred_at DESC)
  WHERE establishment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_funnel_events_wa_id
  ON conversation_funnel_events (wa_id)
  WHERE wa_id IS NOT NULL;

COMMENT ON TABLE conversation_funnel_events IS
  'Eventos granulares do funil conversacional (passos, loops, handoff, conversão)';

COMMENT ON COLUMN conversation_funnel_events.payload IS
  'Metadados não identificáveis após anonimização LGPD (contagens, códigos, flags)';
