-- Migração para adicionar campo seals na tabela menu_items
-- Este campo armazenará os IDs dos selos selecionados como JSON

-- Adicionar coluna seals na tabela menu_items
ALTER TABLE `menu_items` 
ADD COLUMN `seals` JSON DEFAULT NULL COMMENT 'Array de IDs dos selos selecionados para o item' 
AFTER `subCategory`;

-- Adicionar índice para melhor performance em consultas com selos
CREATE INDEX `idx_menu_items_seals` ON `menu_items` ((CAST(`seals` AS CHAR(255) ARRAY)));

-- Comentário da tabela atualizada
ALTER TABLE `menu_items` COMMENT = 'Tabela de itens do cardápio com suporte a selos de identificação';
