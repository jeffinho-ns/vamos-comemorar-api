-- Adicionar campos preferred_area_id e preferred_table_number na tabela waitlist (PostgreSQL)
ALTER TABLE waitlist
ADD COLUMN IF NOT EXISTS preferred_area_id INTEGER;

ALTER TABLE waitlist
ADD COLUMN IF NOT EXISTS preferred_table_number VARCHAR(50);

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_waitlist_area ON waitlist(preferred_area_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_table ON waitlist(preferred_table_number);
