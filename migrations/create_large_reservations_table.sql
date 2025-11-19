-- Migração para criar tabela de reservas grandes
-- Reservas acima de 15 pessoas que não usam mesas específicas

CREATE TABLE IF NOT EXISTS `large_reservations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `establishment_id` int(11) NOT NULL,
  `client_name` varchar(255) NOT NULL,
  `client_phone` varchar(20) DEFAULT NULL,
  `client_email` varchar(255) DEFAULT NULL,
  `data_nascimento_cliente` date DEFAULT NULL,
  `reservation_date` date NOT NULL,
  `reservation_time` time NOT NULL,
  `number_of_people` int(11) NOT NULL,
  `area_id` int(11) DEFAULT NULL,
  `selected_tables` text DEFAULT NULL COMMENT 'JSON com IDs das mesas selecionadas pelo admin',
  `status` enum('NOVA','CONFIRMADA','CANCELADA','CHECKED_IN','COMPLETED') DEFAULT 'NOVA',
  `origin` enum('CLIENTE','ADMIN') DEFAULT 'CLIENTE',
  `notes` text DEFAULT NULL,
  `admin_notes` text DEFAULT NULL COMMENT 'Notas internas do admin',
  `created_by` int(11) DEFAULT NULL,
  `check_in_time` datetime DEFAULT NULL,
  `check_out_time` datetime DEFAULT NULL,
  `email_sent` tinyint(1) DEFAULT 0,
  `whatsapp_sent` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_establishment_id` (`establishment_id`),
  KEY `idx_reservation_date` (`reservation_date`),
  KEY `idx_status` (`status`),
  KEY `idx_area_id` (`area_id`),
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adicionar índice composto para consultas frequentes
CREATE INDEX idx_large_reservations_establishment_date ON large_reservations(establishment_id, reservation_date);

-- Comentário explicativo da tabela
ALTER TABLE `large_reservations` COMMENT = 'Reservas grandes (acima de 15 pessoas) que podem usar múltiplas mesas';









