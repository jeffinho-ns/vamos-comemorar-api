-- Cópia futura das abas de planilha. A tela ainda não grava aqui.

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS bi_sheet_snapshots (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER,
  source TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_sheet_snapshots_source_captured
  ON bi_sheet_snapshots (source, captured_at DESC);
