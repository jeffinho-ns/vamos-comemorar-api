-- =====================================================================================================
-- Migration: Adicionar campo subcategory_order à tabela menu_items
-- Objetivo: Separar ordem da subcategoria da ordem do item, evitando que salvar ordem dos itens
--           sobrescreva a ordem das subcategorias (e vice-versa).
-- Data: 2026-02-24
-- =====================================================================================================

-- PASSO 1: Adicionar coluna subcategory_order (ordem da subcategoria dentro da categoria)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'menu_items' AND column_name = 'subcategory_order'
    ) THEN
        ALTER TABLE menu_items ADD COLUMN subcategory_order INTEGER NULL;
    END IF;
END $$;
COMMENT ON COLUMN menu_items.subcategory_order IS 'Ordem da subcategoria dentro da categoria. Usado apenas pelo reorder de subcategorias; a coluna "order" é a ordem do item.';

-- PASSO 2: Backfill: copiar o valor atual de "order" para subcategory_order nos itens que têm subcategoria
-- Assim preservamos a ordem atual das subcategorias; a coluna "order" continuará sendo usada para ordem do item.
UPDATE menu_items
SET subcategory_order = "order"
WHERE subcategory IS NOT NULL AND subcategory != '' AND subcategory != ' '
  AND subcategory_order IS NULL;

-- PASSO 3: Índice para ordenação (opcional, melhora performance)
CREATE INDEX IF NOT EXISTS idx_menu_items_subcategory_order
ON menu_items(categoryid, subcategory_order NULLS LAST, "order");

SELECT 'Coluna subcategory_order adicionada à tabela menu_items' AS mensagem;
