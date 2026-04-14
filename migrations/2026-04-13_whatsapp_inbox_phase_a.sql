-- Fase A (WhatsApp Atendimento): segmentação por estabelecimento + CRM básico + fila
-- Execute no PostgreSQL (Render/prod) antes do deploy da API.

SET search_path TO meu_backup_db, public;

-- 1) Conversas passam a ter estabelecimento, status e responsável.
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS establishment_id INTEGER REFERENCES places(id),
  ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_whatsapp_conversations_status'
  ) THEN
    ALTER TABLE whatsapp_conversations
      ADD CONSTRAINT chk_whatsapp_conversations_status
      CHECK (status IN ('new', 'in_progress', 'waiting_customer', 'resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_establishment_updated
  ON whatsapp_conversations (establishment_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_status_updated
  ON whatsapp_conversations (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_user
  ON whatsapp_conversations (assigned_user_id, updated_at DESC);

-- 2) CRM leve para contatos WhatsApp (dedupe por wa_id).
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id SERIAL PRIMARY KEY,
  wa_id VARCHAR(32) NOT NULL UNIQUE,
  contact_name VARCHAR(255),
  client_email VARCHAR(255),
  birth_date DATE,
  last_establishment_id INTEGER REFERENCES places(id),
  last_reservation_id INTEGER REFERENCES restaurant_reservations(id),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_opt_in_at TIMESTAMPTZ,
  source_channel VARCHAR(24) NOT NULL DEFAULT 'WHATSAPP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_last_establishment
  ON whatsapp_contacts (last_establishment_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_marketing_opt_in
  ON whatsapp_contacts (marketing_opt_in, last_seen_at DESC);

COMMENT ON TABLE whatsapp_contacts IS 'CRM básico de contatos vindos do WhatsApp para atendimento e segmentação';
