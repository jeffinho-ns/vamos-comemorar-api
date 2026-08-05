SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS openai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  establishment_id INT NULL,
  conversation_id INT NULL,
  wa_id TEXT NULL,
  path TEXT NOT NULL,
  model TEXT NULL,
  prompt_tokens INT NULL,
  completion_tokens INT NULL,
  total_tokens INT NULL,
  cached_tokens INT NULL,
  request_id TEXT NULL,
  meta JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_openai_usage_events_created_at
  ON openai_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openai_usage_events_establishment_created
  ON openai_usage_events (establishment_id, created_at DESC);
