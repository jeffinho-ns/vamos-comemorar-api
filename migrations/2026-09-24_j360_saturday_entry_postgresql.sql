-- Lançamento do sábado no mesmo formato da planilha e do Justino360 da gerente:
-- reservas + walk-in, e em cada garçom a venda, a taxa e as pessoas.

ALTER TABLE j360_saturday_days
  ADD COLUMN IF NOT EXISTS reservations_confirmed INTEGER,
  ADD COLUMN IF NOT EXISTS walkin_expected INTEGER;

ALTER TABLE j360_saturday_sales
  ADD COLUMN IF NOT EXISTS service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS people_count INTEGER;
