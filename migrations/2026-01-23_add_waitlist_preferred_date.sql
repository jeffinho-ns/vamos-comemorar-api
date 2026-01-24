-- Adicionar data preferida na lista de espera
ALTER TABLE waitlist
ADD COLUMN IF NOT EXISTS preferred_date DATE;

-- Índice para filtro por estabelecimento/data/status
CREATE INDEX IF NOT EXISTS idx_waitlist_estab_date_status
ON waitlist (establishment_id, preferred_date, status);
