-- Itens escolhidos pelo colaborador para a faixa Destaques do cardápio público.

ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN menu_items.featured IS 'Quando verdadeiro, o item aparece na faixa Destaques do cardápio público.';

CREATE INDEX IF NOT EXISTS idx_menu_items_featured
ON menu_items (barid)
WHERE featured = TRUE;
