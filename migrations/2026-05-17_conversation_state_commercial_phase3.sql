-- Fase 3: contexto comercial, follow-up e recuperação de abandono.
-- Execute no PostgreSQL antes do deploy da API.

SET search_path TO meu_backup_db, public;

ALTER TABLE conversation_state
  ADD COLUMN IF NOT EXISTS emotional_state VARCHAR(32),
  ADD COLUMN IF NOT EXISTS lead_temperature VARCHAR(16),
  ADD COLUMN IF NOT EXISTS lead_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS followup_status VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_conversation_state_followup_status
  ON conversation_state (followup_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS reservation_whatsapp_followups (
  id BIGSERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES restaurant_reservations(id) ON DELETE CASCADE,
  wa_id VARCHAR(32),
  followup_type VARCHAR(32) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_body TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'sent',
  CONSTRAINT uq_reservation_whatsapp_followups UNIQUE (reservation_id, followup_type)
);

CREATE INDEX IF NOT EXISTS idx_reservation_whatsapp_followups_sent_at
  ON reservation_whatsapp_followups (sent_at DESC);

COMMENT ON COLUMN conversation_state.followup_status IS
  'none | recovery_pending | recovery_sent | pre_event_sent | post_event_sent | completed';
