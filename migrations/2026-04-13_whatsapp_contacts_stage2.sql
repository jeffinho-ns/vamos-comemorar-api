-- Etapa 2 (continuação): edição de CRM + campanhas salvas por estabelecimento
-- Execute no PostgreSQL antes do deploy desta etapa.

SET search_path TO meu_backup_db, public;

ALTER TABLE whatsapp_contacts
  ADD COLUMN IF NOT EXISTS contact_status VARCHAR(24) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_whatsapp_contacts_contact_status'
  ) THEN
    ALTER TABLE whatsapp_contacts
      ADD CONSTRAINT chk_whatsapp_contacts_contact_status
      CHECK (contact_status IN ('new', 'qualified', 'customer', 'inactive'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_status_seen
  ON whatsapp_contacts (contact_status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES places(id),
  name VARCHAR(150) NOT NULL,
  message_template TEXT NOT NULL,
  target_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_establishment
  ON whatsapp_campaigns (establishment_id, updated_at DESC);

COMMENT ON TABLE whatsapp_campaigns IS 'Campanhas salvas por estabelecimento para uso operacional de WhatsApp';
