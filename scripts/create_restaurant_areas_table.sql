-- Script para criar a tabela restaurant_areas
-- Execute este script no seu banco de dados MySQL

CREATE TABLE IF NOT EXISTS `restaurant_areas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `capacity_lunch` int(11) DEFAULT 0,
  `capacity_dinner` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inserir dados de exemplo
INSERT IGNORE INTO `restaurant_areas` (`id`, `name`, `description`, `capacity_lunch`, `capacity_dinner`, `is_active`) VALUES
(1, 'Área Coberta', 'Área interna com ar condicionado e ambiente climatizado', 50, 40, 1),
(2, 'Área Descoberta', 'Área externa com vista para o jardim e ambiente natural', 30, 25, 1),
(3, 'Área VIP', 'Área exclusiva com serviço diferenciado', 20, 15, 1),
(4, 'Balcão', 'Área do balcão para refeições rápidas', 15, 12, 1),
(5, 'Terraço', 'Área no terraço com vista panorâmica', 25, 20, 1);












