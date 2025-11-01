-- Migração para adicionar campos de personalização de cores no menu
-- Este script adiciona colunas JSON na tabela bars para armazenar cores personalizadas

-- Cores das categorias (background e texto separados)
ALTER TABLE `bars` 
ADD COLUMN `menu_category_bg_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor de fundo das categorias no formato hexadecimal (#RRGGBB)' AFTER `whatsapp`,
ADD COLUMN `menu_category_text_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor do texto das categorias no formato hexadecimal (#RRGGBB)' AFTER `menu_category_bg_color`;

-- Cores das subcategorias (background e texto separados)
ALTER TABLE `bars` 
ADD COLUMN `menu_subcategory_bg_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor de fundo das subcategorias no formato hexadecimal (#RRGGBB)' AFTER `menu_category_text_color`,
ADD COLUMN `menu_subcategory_text_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor do texto das subcategorias no formato hexadecimal (#RRGGBB)' AFTER `menu_subcategory_bg_color`;

-- Cores do sidebar mobile (background e texto separados)
ALTER TABLE `bars` 
ADD COLUMN `mobile_sidebar_bg_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor de fundo do sidebar mobile no formato hexadecimal (#RRGGBB)' AFTER `menu_subcategory_text_color`,
ADD COLUMN `mobile_sidebar_text_color` VARCHAR(7) DEFAULT NULL COMMENT 'Cor do texto do sidebar mobile no formato hexadecimal (#RRGGBB)' AFTER `mobile_sidebar_bg_color`;

-- Cores customizadas dos selos (JSON com selos customizados por bar)
ALTER TABLE `bars` 
ADD COLUMN `custom_seals` JSON DEFAULT NULL COMMENT 'Array JSON com selos customizados e suas cores: [{"id": "string", "name": "string", "color": "#hex", "type": "food|drink"}, ...]' AFTER `mobile_sidebar_text_color`;

-- Comentário atualizado da tabela
ALTER TABLE `bars` COMMENT = 'Tabela de estabelecimentos com suporte a personalização de cores do menu e selos customizados';

