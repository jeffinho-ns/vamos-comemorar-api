-- Fase 2: memória operacional do cliente para personalização da IA.
-- Execute no PostgreSQL antes do deploy da API.

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS customer_operational_profile (
  id BIGSERIAL PRIMARY KEY,
  wa_id VARCHAR(32) NOT NULL UNIQUE,
  client_email VARCHAR(255),
  favorite_establishment_id INTEGER REFERENCES places(id),
  favorite_area_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  avg_party_size NUMERIC(6, 2),
  avg_ticket_estimate NUMERIC(10, 2),
  reservation_count_12m INTEGER NOT NULL DEFAULT 0,
  no_show_count_12m INTEGER NOT NULL DEFAULT 0,
  last_reservation_at TIMESTAMPTZ,
  last_no_show_at TIMESTAMPTZ,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  profile_summary TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_operational_profile_email
  ON customer_operational_profile (LOWER(client_email))
  WHERE client_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_operational_profile_favorite_establishment
  ON customer_operational_profile (favorite_establishment_id);

COMMENT ON TABLE customer_operational_profile IS
  'Perfil operacional agregado do cliente para personalização conversacional e CRM';
