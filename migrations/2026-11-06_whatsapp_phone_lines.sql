-- Número WhatsApp Cloud API de cada casa.
-- phone_number_id é o ID da Meta (não o telefone). O token fica vazio quando
-- o número usa o mesmo WHATSAPP_ACCESS_TOKEN do ambiente.

CREATE TABLE IF NOT EXISTS whatsapp_phone_lines (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES places(id),
  phone_number_id VARCHAR(64) NOT NULL,
  display_phone VARCHAR(32),
  access_token TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_phone_lines_establishment
  ON whatsapp_phone_lines (establishment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_phone_lines_phone_number_id
  ON whatsapp_phone_lines (phone_number_id);

COMMENT ON TABLE whatsapp_phone_lines IS
  'Linha WhatsApp da Meta por estabelecimento. O webhook trava a casa pelo phone_number_id.';
