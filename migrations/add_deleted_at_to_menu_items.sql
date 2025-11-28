-- =====================================================================================================
-- Migration: Adicionar campo deleted_at para soft delete nos itens do cardápio
-- Objetivo: Permitir "desfazer" exclusões por até 30 dias antes da exclusão permanente
-- Data: 2025-01-XX
-- =====================================================================================================

-- =====================================================================================================
-- PASSO 1: Adicionar campo 'deleted_at' à tabela menu_items
-- =====================================================================================================

-- Verificar se a coluna já existe antes de adicionar (PostgreSQL)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'menu_items' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE menu_items 
        ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;
        
        COMMENT ON COLUMN menu_items.deleted_at IS 'Data/hora da exclusão (soft delete). NULL = não deletado';
    ELSE
        RAISE NOTICE 'Coluna deleted_at já existe na tabela menu_items';
    END IF;
END $$;

-- =====================================================================================================
-- PASSO 2: Criar índice para melhorar performance de consultas
-- =====================================================================================================

CREATE INDEX IF NOT EXISTS idx_menu_items_deleted_at 
ON menu_items(deleted_at);

-- =====================================================================================================
-- PASSO 3: Atualizar consultas para excluir itens deletados por padrão
-- =====================================================================================================
-- Nota: As consultas existentes precisarão ser atualizadas para incluir:
-- WHERE deleted_at IS NULL
-- ou
-- WHERE deleted_at IS NULL OR deleted_at > NOW() - INTERVAL '30 days'

-- =====================================================================================================
-- VERIFICAÇÃO
-- =====================================================================================================

-- Verificar se a coluna foi adicionada
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'menu_items'
AND column_name = 'deleted_at';

-- Contar itens deletados vs não deletados
SELECT 
    CASE 
        WHEN deleted_at IS NULL THEN 'Ativos'
        ELSE 'Deletados'
    END AS status,
    COUNT(*) AS total
FROM menu_items
GROUP BY 
    CASE 
        WHEN deleted_at IS NULL THEN 'Ativos'
        ELSE 'Deletados'
    END;

-- =====================================================================================================
-- EXEMPLO DE USO
-- =====================================================================================================

/*
-- Soft delete (marcar como deletado):
UPDATE menu_items 
SET deleted_at = NOW() 
WHERE id = 5;

-- Restaurar item (desfazer exclusão):
UPDATE menu_items 
SET deleted_at = NULL 
WHERE id = 5;

-- Buscar apenas itens ativos (não deletados):
SELECT * FROM menu_items WHERE deleted_at IS NULL;

-- Buscar apenas itens deletados:
SELECT * FROM menu_items WHERE deleted_at IS NOT NULL;

-- Buscar itens deletados há menos de 30 dias (que podem ser restaurados):
SELECT * FROM menu_items 
WHERE deleted_at IS NOT NULL 
  AND deleted_at > NOW() - INTERVAL '30 days';

-- Excluir permanentemente itens deletados há mais de 30 dias:
DELETE FROM menu_items 
WHERE deleted_at IS NOT NULL 
  AND deleted_at < NOW() - INTERVAL '30 days';
*/

-- =====================================================================================================
-- ROLLBACK (se necessário)
-- =====================================================================================================

/*
-- Para reverter a migração, execute:

DROP INDEX IF EXISTS idx_menu_items_deleted_at;
ALTER TABLE menu_items DROP COLUMN IF EXISTS deleted_at;

-- CUIDADO: Isso vai perder os dados de deleted_at, mas não afetará os itens ativos.
*/

-- =====================================================================================================
-- FIM DA MIGRATION
-- =====================================================================================================

SELECT '✅ Migration concluída com sucesso!' AS mensagem;
SELECT 'Campo "deleted_at" adicionado à tabela menu_items' AS mensagem;

