-- Adicionar campo has_bistro_table na tabela waitlist
ALTER TABLE waitlist
ADD COLUMN IF NOT EXISTS has_bistro_table BOOLEAN DEFAULT FALSE;

-- Adicionar campo has_bistro_table na tabela restaurant_reservations
ALTER TABLE restaurant_reservations
ADD COLUMN IF NOT EXISTS has_bistro_table BOOLEAN DEFAULT FALSE;

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_waitlist_bistro ON waitlist(has_bistro_table);
CREATE INDEX IF NOT EXISTS idx_reservations_bistro ON restaurant_reservations(has_bistro_table);
