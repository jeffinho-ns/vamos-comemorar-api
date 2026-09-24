-- Bonificação do mês. Não entra no snapshot do fechamento: fechar de novo não apaga a decisão.

CREATE TABLE IF NOT EXISTS iri_reward_grants (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  year_month CHAR(7) NOT NULL,
  user_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('concedido', 'nao_desta_vez')),
  note TEXT,
  decided_by INTEGER,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, establishment_id, year_month, user_id)
);

CREATE INDEX IF NOT EXISTS idx_iri_reward_grants_month
  ON iri_reward_grants (organization_id, establishment_id, year_month);
