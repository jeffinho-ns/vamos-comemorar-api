CREATE TABLE IF NOT EXISTS instagram_accounts (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES places(id),
  ig_user_id VARCHAR(64) NOT NULL,
  page_id VARCHAR(64),
  username VARCHAR(128),
  access_token TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_instagram_accounts_establishment
  ON instagram_accounts (establishment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_instagram_accounts_ig_user_id
  ON instagram_accounts (ig_user_id);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_page_id
  ON instagram_accounts (page_id)
  WHERE page_id IS NOT NULL AND page_id <> '';

COMMENT ON TABLE instagram_accounts IS
  'Conta Instagram Direct da casa. O webhook usa ig_user_id/page_id para travar o estabelecimento.';
