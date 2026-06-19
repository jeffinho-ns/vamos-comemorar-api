SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS ai_assistant_settings (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  assistant_name VARCHAR(80) NOT NULL DEFAULT '',
  gender VARCHAR(20) NOT NULL DEFAULT 'feminino',
  response_size VARCHAR(20) NOT NULL DEFAULT 'media',
  tone VARCHAR(20) NOT NULL DEFAULT 'amigavel',
  use_emojis BOOLEAN NOT NULL DEFAULT TRUE,
  use_bullets BOOLEAN NOT NULL DEFAULT FALSE,
  use_greeting BOOLEAN NOT NULL DEFAULT TRUE,
  greet_when_already_greeted BOOLEAN NOT NULL DEFAULT FALSE,
  slang_text TEXT NOT NULL DEFAULT '',
  slang_intensity VARCHAR(20) NOT NULL DEFAULT 'leve',
  custom_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  behavior_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  follow_up_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ice_breakers_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ice_breakers_channels JSONB NOT NULL DEFAULT '["whatsapp"]'::jsonb,
  ai_globally_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_assistant_settings_establishment
  ON ai_assistant_settings (establishment_id);

ALTER TABLE ai_assistant_settings
  ADD COLUMN IF NOT EXISTS ice_breakers_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE ai_assistant_settings
  ADD COLUMN IF NOT EXISTS ice_breakers_channels JSONB NOT NULL DEFAULT '["whatsapp"]'::jsonb;

ALTER TABLE ai_assistant_settings
  ADD COLUMN IF NOT EXISTS ai_globally_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE establishment_faq
  ADD COLUMN IF NOT EXISTS category VARCHAR(32) NOT NULL DEFAULT 'geral';

CREATE INDEX IF NOT EXISTS idx_establishment_faq_category
  ON establishment_faq (establishment_id, category);

CREATE TABLE IF NOT EXISTS ai_external_links (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  link_key VARCHAR(40) NOT NULL DEFAULT 'custom',
  title VARCHAR(120) NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_external_links_establishment
  ON ai_external_links (establishment_id, is_active);

CREATE TABLE IF NOT EXISTS ai_ice_breakers (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  sort_order INTEGER NOT NULL DEFAULT 0,
  label VARCHAR(60) NOT NULL DEFAULT '',
  question VARCHAR(160) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_ice_breakers_establishment
  ON ai_ice_breakers (establishment_id, channel);

CREATE TABLE IF NOT EXISTS ai_stickers (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  trigger VARCHAR(120) NOT NULL DEFAULT '',
  media_id TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_stickers_establishment
  ON ai_stickers (establishment_id, is_active);

CREATE TABLE IF NOT EXISTS ai_allowed_numbers (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  phone_e164 VARCHAR(20) NOT NULL,
  label VARCHAR(80) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_allowed_numbers_establishment_phone
  ON ai_allowed_numbers (establishment_id, phone_e164);
