-- Criação das tabelas de listas de convidados e convidados
-- Executar no MySQL de produção e staging antes de liberar o front

CREATE TABLE IF NOT EXISTS `guest_lists` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  -- Referência à reserva. Para suportar reservas normais e grandes, usamos reservation_type
  `reservation_id` int(11) NOT NULL,
  `reservation_type` enum('restaurant','large') NOT NULL DEFAULT 'large' COMMENT 'Origem da reserva: restaurant_reservations ou large_reservations',
  `event_type` enum('aniversario','despedida','lista_sexta') DEFAULT NULL,
  `shareable_link_token` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_guest_lists_token` (`shareable_link_token`),
  KEY `idx_reservation` (`reservation_type`, `reservation_id`),
  KEY `idx_expires_at` (`expires_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `guest_list_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `whatsapp` varchar(30) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_guest_list_id` (`guest_list_id`),
  CONSTRAINT `fk_guests_guest_list` FOREIGN KEY (`guest_list_id`) REFERENCES `guest_lists` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


