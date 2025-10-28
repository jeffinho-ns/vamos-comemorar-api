-- Migration: Criação da tabela de logs de ações
-- Descrição: Tabela para rastrear todas as ações dos usuários no sistema
-- Data: 15/10/2025

CREATE TABLE IF NOT EXISTS action_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  action_description TEXT NOT NULL,
  resource_type VARCHAR(100),
  resource_id INT,
  establishment_id INT,
  establishment_name VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_method VARCHAR(10),
  request_url TEXT,
  status VARCHAR(50),
  additional_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_user_role (user_role),
  INDEX idx_action_type (action_type),
  INDEX idx_resource_type (resource_type),
  INDEX idx_establishment_id (establishment_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;








