-- Meta de sábado do Seu Justino: planejamento, vendas dos garçons e base do bônus.

CREATE TABLE IF NOT EXISTS j360_saturday_days (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  service_date DATE NOT NULL,
  people_expected INTEGER,
  ticket_expected NUMERIC(12, 2),
  revenue_goal NUMERIC(12, 2),
  people_real INTEGER,
  revenue_real NUMERIC(12, 2),
  waiters_scheduled INTEGER,
  created_by INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (establishment_id, service_date)
);

CREATE TABLE IF NOT EXISTS j360_saturday_sales (
  id SERIAL PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES j360_saturday_days(id) ON DELETE CASCADE,
  waiter_name VARCHAR(160) NOT NULL,
  waiter_code VARCHAR(40),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_j360_saturday_sales_day
  ON j360_saturday_sales (day_id);
