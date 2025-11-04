-- Script para criar a tabela operational_details
-- Execute este script no banco de dados MySQL

CREATE TABLE IF NOT EXISTS operational_details (
  id INT(11) NOT NULL AUTO_INCREMENT,
  event_id INT(11) DEFAULT NULL,
  establishment_id INT(11) DEFAULT NULL,
  event_date DATE NOT NULL,
  artistic_attraction VARCHAR(255) NOT NULL,
  show_schedule TEXT DEFAULT NULL,
  ticket_prices TEXT NOT NULL,
  promotions TEXT DEFAULT NULL,
  visual_reference_url VARCHAR(255) DEFAULT NULL,
  admin_notes TEXT DEFAULT NULL,
  operational_instructions TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_event_date (event_date),
  KEY idx_establishment_id (establishment_id),
  KEY idx_event_id (event_id),
  KEY idx_event_date (event_date),
  KEY idx_is_active (is_active),
  CONSTRAINT fk_operational_details_establishment FOREIGN KEY (establishment_id) 
    REFERENCES places(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_operational_details_event FOREIGN KEY (event_id) 
    REFERENCES eventos(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

