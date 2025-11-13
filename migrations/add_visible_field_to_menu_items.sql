-- =====================================================================================================
-- Migration: Adicionar campo de visibilidade aos itens do cardápio
-- Objetivo: Permitir ocultar itens sem excluir do banco de dados
-- Data: 2025-10-24
-- =====================================================================================================

-- =====================================================================================================
-- PASSO 1: Adicionar campo 'visible' à tabela menu_items
-- =====================================================================================================

-- Verificar se a coluna já existe antes de adicionar
SELECT CONCAT('Verificando se coluna visible existe...') AS Info;

ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS visible TINYINT(1) DEFAULT 1 
COMMENT 'Define se o item está visível no cardápio (1=visível, 0=oculto)';

-- =====================================================================================================
-- PASSO 2: Garantir que todos os itens existentes estejam visíveis por padrão
-- =====================================================================================================

UPDATE menu_items 
SET visible = 1 
WHERE visible IS NULL;

SELECT CONCAT('Campo visible adicionado com sucesso!') AS Info;

-- =====================================================================================================
-- PASSO 3: Criar índice para melhorar performance de consultas
-- =====================================================================================================

CREATE INDEX IF NOT EXISTS idx_menu_items_visible 
ON menu_items(visible);

SELECT CONCAT('Índice criado com sucesso!') AS Info;

-- =====================================================================================================
-- PASSO 4: Verificação dos resultados
-- =====================================================================================================

SELECT '=== Verificação da Migração ===' AS '';

-- Verificar estrutura da tabela
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'menu_items'
AND COLUMN_NAME = 'visible';

-- Contar itens visíveis vs ocultos
SELECT 
    CASE 
        WHEN visible = 1 THEN 'Visíveis'
        WHEN visible = 0 THEN 'Ocultos'
        ELSE 'NULL'
    END AS status,
    COUNT(*) AS total
FROM menu_items
GROUP BY visible;

-- =====================================================================================================
-- EXEMPLO DE USO
-- =====================================================================================================

/*

-- Ocultar um item específico (ex: item com ID 5):
UPDATE menu_items SET visible = 0 WHERE id = 5;

-- Tornar um item visível novamente:
UPDATE menu_items SET visible = 1 WHERE id = 5;

-- Buscar apenas itens visíveis:
SELECT * FROM menu_items WHERE visible = 1;

-- Buscar apenas itens ocultos:
SELECT * FROM menu_items WHERE visible = 0;

-- Buscar todos os itens (incluindo ocultos):
SELECT *, 
    CASE 
        WHEN visible = 1 THEN 'Visível'
        ELSE 'Oculto'
    END AS status_visibilidade
FROM menu_items;

*/

-- =====================================================================================================
-- ROLLBACK (se necessário)
-- =====================================================================================================

/*

-- Para reverter a migração, execute:

DROP INDEX IF EXISTS idx_menu_items_visible ON menu_items;
ALTER TABLE menu_items DROP COLUMN IF EXISTS visible;

*/

-- =====================================================================================================
-- FIM DA MIGRATION
-- =====================================================================================================

SELECT '✅ Migration concluída com sucesso!' AS '';
SELECT 'Campo "visible" adicionado à tabela menu_items' AS '';
SELECT 'Todos os itens existentes estão visíveis por padrão' AS '';











