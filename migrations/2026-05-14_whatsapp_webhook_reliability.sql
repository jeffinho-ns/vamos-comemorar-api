-- Fase 0: idempotência de mensagens inbound (wamid) do webhook WhatsApp.
-- Execute no PostgreSQL antes do deploy da API.

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS whatsapp_message_dedup (
  provider_message_id VARCHAR(128) PRIMARY KEY,
  wa_id VARCHAR(32),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_dedup_received_at
  ON whatsapp_message_dedup (received_at DESC);

COMMENT ON TABLE whatsapp_message_dedup IS
  'Deduplicação de mensagens inbound Meta (wamid) para evitar reprocessamento em reentregas do webhook';
