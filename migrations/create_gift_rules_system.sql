-- Sistema de Regras de Brindes para Reservas de Restaurante
-- Esta tabela armazena regras configuráveis de brindes por estabelecimento/evento

CREATE TABLE IF NOT EXISTS `gift_rules` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `establishment_id` INT(11) NOT NULL COMMENT 'ID do estabelecimento',
  `evento_id` INT(11) NULL DEFAULT NULL COMMENT 'ID do evento (opcional - NULL significa válido para todos os eventos)',
  `descricao` VARCHAR(255) NOT NULL COMMENT 'Descrição do brinde (ex: "1 drink", "4 cervejas")',
  `checkins_necessarios` INT(11) NOT NULL COMMENT 'Quantidade de check-ins necessários para liberar o brinde',
  `status` ENUM('ATIVA', 'INATIVA') DEFAULT 'ATIVA' COMMENT 'Status da regra',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_establishment` (`establishment_id`),
  KEY `idx_evento` (`evento_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela para armazenar brindes liberados por guest list/reserva
CREATE TABLE IF NOT EXISTS `guest_list_gifts` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `guest_list_id` INT(11) NOT NULL COMMENT 'ID da guest list',
  `gift_rule_id` INT(11) NOT NULL COMMENT 'ID da regra de brinde que foi atingida',
  `status` ENUM('LIBERADO', 'ENTREGUE', 'CANCELADO') DEFAULT 'LIBERADO' COMMENT 'Status do brinde',
  `checkins_count` INT(11) NOT NULL COMMENT 'Quantidade de check-ins quando foi liberado',
  `liberado_em` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data/hora em que o brinde foi liberado',
  `entregue_em` TIMESTAMP NULL DEFAULT NULL COMMENT 'Data/hora em que o brinde foi entregue',
  PRIMARY KEY (`id`),
  KEY `idx_guest_list` (`guest_list_id`),
  KEY `idx_gift_rule` (`gift_rule_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_gift_guest_list` FOREIGN KEY (`guest_list_id`) REFERENCES `guest_lists` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gift_rule` FOREIGN KEY (`gift_rule_id`) REFERENCES `gift_rules` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_guest_list_gift_rule` (`guest_list_id`, `gift_rule_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
