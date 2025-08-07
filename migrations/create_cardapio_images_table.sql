-- Criação da tabela para armazenar informações das imagens do cardápio
CREATE TABLE IF NOT EXISTS `cardapio_images` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL COMMENT 'Nome do arquivo no servidor',
  `original_name` varchar(255) NOT NULL COMMENT 'Nome original do arquivo',
  `file_size` int(11) NOT NULL COMMENT 'Tamanho do arquivo em bytes',
  `mime_type` varchar(100) NOT NULL COMMENT 'Tipo MIME do arquivo',
  `url` varchar(500) NOT NULL COMMENT 'URL completa da imagem',
  `type` varchar(50) DEFAULT 'general' COMMENT 'Tipo da imagem (logo, cover, item, etc)',
  `entity_id` int(11) DEFAULT NULL COMMENT 'ID da entidade relacionada (bar, item, etc)',
  `entity_type` varchar(50) DEFAULT NULL COMMENT 'Tipo da entidade (bar, item, category, etc)',
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora do upload',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data e hora da última atualização',
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_entity` (`entity_type`, `entity_id`),
  KEY `idx_uploaded_at` (`uploaded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabela para armazenar informações das imagens do cardápio';

-- Inserir alguns dados de exemplo (opcional)
INSERT INTO `cardapio_images` (`filename`, `original_name`, `file_size`, `mime_type`, `url`, `type`, `entity_type`) VALUES
('example-logo.jpg', 'logo-exemplo.jpg', 102400, 'image/jpeg', 'https://www.grupoideiaum.com.br/cardapio-agilizaiapp/example-logo.jpg', 'logo', 'bar'),
('example-cover.jpg', 'capa-exemplo.jpg', 204800, 'image/jpeg', 'https://www.grupoideiaum.com.br/cardapio-agilizaiapp/example-cover.jpg', 'cover', 'bar'),
('example-item.jpg', 'item-exemplo.jpg', 153600, 'image/jpeg', 'https://www.grupoideiaum.com.br/cardapio-agilizaiapp/example-item.jpg', 'item', 'menu_item'); 