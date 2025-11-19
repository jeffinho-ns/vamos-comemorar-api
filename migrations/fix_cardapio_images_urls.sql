-- Script para corrigir URLs de imagens no cardápio após migração para PostgreSQL
-- Este script garante que as imagens sejam armazenadas corretamente

-- 1. Verificar itens com imageUrl NULL ou vazio
SELECT 
    id, 
    name, 
    imageUrl,
    CASE 
        WHEN imageUrl IS NULL THEN 'NULL'
        WHEN imageUrl = '' THEN 'VAZIO'
        WHEN imageUrl LIKE 'http%' THEN 'URL_COMPLETA'
        ELSE 'FILENAME'
    END as tipo
FROM menu_items 
WHERE imageUrl IS NULL OR imageUrl = '' OR imageUrl LIKE 'http%'
ORDER BY id
LIMIT 20;

-- 2. Limpar URLs completas, mantendo apenas o filename
-- Exemplo: 'https://grupoideiaum.com.br/cardapio-agilizaiapp/ABC123.jpg' -> 'ABC123.jpg'
UPDATE menu_items 
SET imageUrl = SUBSTRING(imageUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
WHERE imageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%';

UPDATE menu_items 
SET imageUrl = SUBSTRING(imageUrl FROM LENGTH('http://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
WHERE imageUrl LIKE 'http://grupoideiaum.com.br/cardapio-agilizaiapp/%';

-- 3. Remover barras iniciais se houver
UPDATE menu_items 
SET imageUrl = SUBSTRING(imageUrl FROM 2)
WHERE imageUrl LIKE '/%' AND LENGTH(imageUrl) > 1;

-- 4. Verificar bares com logoUrl ou coverImageUrl incorretos
SELECT 
    id,
    name,
    logoUrl,
    coverImageUrl,
    CASE 
        WHEN logoUrl IS NULL THEN 'NULL'
        WHEN logoUrl = '' THEN 'VAZIO'
        WHEN logoUrl LIKE 'http%' THEN 'URL_COMPLETA'
        ELSE 'FILENAME'
    END as logo_tipo,
    CASE 
        WHEN coverImageUrl IS NULL THEN 'NULL'
        WHEN coverImageUrl = '' THEN 'VAZIO'
        WHEN coverImageUrl LIKE 'http%' THEN 'URL_COMPLETA'
        ELSE 'FILENAME'
    END as cover_tipo
FROM bars 
WHERE logoUrl IS NULL OR logoUrl = '' OR logoUrl LIKE 'http%'
   OR coverImageUrl IS NULL OR coverImageUrl = '' OR coverImageUrl LIKE 'http%'
LIMIT 20;

-- 5. Limpar URLs completas dos bares
UPDATE bars 
SET logoUrl = SUBSTRING(logoUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
WHERE logoUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%';

UPDATE bars 
SET coverImageUrl = SUBSTRING(coverImageUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
WHERE coverImageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%';

UPDATE bars 
SET popupImageUrl = SUBSTRING(popupImageUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
WHERE popupImageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%';

-- 6. Remover barras iniciais das URLs dos bares
UPDATE bars 
SET logoUrl = SUBSTRING(logoUrl FROM 2)
WHERE logoUrl LIKE '/%' AND LENGTH(logoUrl) > 1;

UPDATE bars 
SET coverImageUrl = SUBSTRING(coverImageUrl FROM 2)
WHERE coverImageUrl LIKE '/%' AND LENGTH(coverImageUrl) > 1;

UPDATE bars 
SET popupImageUrl = SUBSTRING(popupImageUrl FROM 2)
WHERE popupImageUrl LIKE '/%' AND LENGTH(popupImageUrl) > 1;

-- 7. Verificar se há imagens na tabela cardapio_images que não estão sendo usadas
SELECT 
    ci.id,
    ci.filename,
    ci.url,
    ci.type,
    ci.entity_type,
    ci.entity_id,
    CASE 
        WHEN ci.entity_type = 'menu_item' THEN (
            SELECT COUNT(*) FROM menu_items mi WHERE mi.imageUrl = ci.filename
        )
        ELSE 0
    END as uso_em_menu_items
FROM cardapio_images ci
WHERE ci.type = 'item' OR ci.entity_type = 'menu_item'
ORDER BY ci.uploaded_at DESC
LIMIT 20;

-- 8. Relatório final: itens sem imagem
SELECT 
    COUNT(*) as total_itens_sem_imagem,
    COUNT(*) * 100.0 / (SELECT COUNT(*) FROM menu_items) as percentual
FROM menu_items 
WHERE imageUrl IS NULL OR imageUrl = '';

-- 9. Relatório final: itens com imagem
SELECT 
    COUNT(*) as total_itens_com_imagem,
    COUNT(*) * 100.0 / (SELECT COUNT(*) FROM menu_items) as percentual
FROM menu_items 
WHERE imageUrl IS NOT NULL AND imageUrl != '';

