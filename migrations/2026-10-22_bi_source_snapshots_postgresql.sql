-- Cópia do que o BI do Seu Justino lê fora do Agilizai.
-- Não altera restaurant_reservations. A tela do Renato continua na planilha
-- até cada fonte daqui mostrar o mesmo número.

CREATE TABLE IF NOT EXISTS bi_source_snapshots (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER,
  source TEXT NOT NULL,
  action TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_source_snapshots_source_captured
  ON bi_source_snapshots (source, captured_at DESC);
