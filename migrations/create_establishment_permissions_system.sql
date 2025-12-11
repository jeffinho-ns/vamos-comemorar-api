-- ============================================================
-- MIGRAÇÃO: Sistema de Permissões por Estabelecimento
-- ============================================================
-- Descrição: Cria tabelas para gerenciar permissões de usuários por estabelecimento
-- Data: 2025-01-XX
-- ============================================================

USE u621081794_vamos;

START TRANSACTION;

-- Tabela principal de permissões de usuário por estabelecimento
CREATE TABLE IF NOT EXISTS user_establishment_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  establishment_id INT NOT NULL,
  can_edit_os BOOLEAN DEFAULT FALSE,
  can_edit_operational_detail BOOLEAN DEFAULT FALSE,
  can_view_os BOOLEAN DEFAULT TRUE,
  can_download_os BOOLEAN DEFAULT TRUE,
  can_view_operational_detail BOOLEAN DEFAULT TRUE,
  can_create_os BOOLEAN DEFAULT FALSE,
  can_create_operational_detail BOOLEAN DEFAULT FALSE,
  can_manage_reservations BOOLEAN DEFAULT FALSE,
  can_manage_checkins BOOLEAN DEFAULT FALSE,
  can_view_reports BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT,
  updated_by INT,
  INDEX idx_user_id (user_id),
  INDEX idx_user_email (user_email),
  INDEX idx_establishment_id (establishment_id),
  INDEX idx_is_active (is_active),
  UNIQUE KEY unique_user_establishment (user_id, establishment_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de logs de auditoria de permissões
CREATE TABLE IF NOT EXISTS permission_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL COMMENT 'CREATE, UPDATE, DELETE, VIEW',
  permission_id INT,
  target_user_id INT,
  target_user_email VARCHAR(255),
  establishment_id INT,
  permission_changes JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_action_type (action_type),
  INDEX idx_target_user_id (target_user_id),
  INDEX idx_establishment_id (establishment_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES user_establishment_permissions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de configurações de permissões padrão por role
CREATE TABLE IF NOT EXISTS role_permission_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL,
  establishment_id INT,
  can_edit_os BOOLEAN DEFAULT FALSE,
  can_edit_operational_detail BOOLEAN DEFAULT FALSE,
  can_view_os BOOLEAN DEFAULT TRUE,
  can_download_os BOOLEAN DEFAULT TRUE,
  can_view_operational_detail BOOLEAN DEFAULT TRUE,
  can_create_os BOOLEAN DEFAULT FALSE,
  can_create_operational_detail BOOLEAN DEFAULT FALSE,
  can_manage_reservations BOOLEAN DEFAULT FALSE,
  can_manage_checkins BOOLEAN DEFAULT FALSE,
  can_view_reports BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_role_establishment (role_name, establishment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

-- ============================================================
-- INSERIR DADOS INICIAIS (Migração dos dados existentes)
-- ============================================================

START TRANSACTION;

-- Inserir permissões para os usuários do Highline (ID 7 na tabela places)
-- gerente@highlinebar.com.br - Acesso completo
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports
) 
SELECT 
  u.id, u.email, 7,
  TRUE, TRUE,
  TRUE, TRUE, TRUE,
  TRUE, TRUE,
  TRUE, TRUE, TRUE
FROM users u
WHERE u.email = 'gerente@highlinebar.com.br'
ON DUPLICATE KEY UPDATE
  can_edit_os = TRUE,
  can_edit_operational_detail = TRUE,
  can_view_os = TRUE,
  can_download_os = TRUE,
  can_view_operational_detail = TRUE,
  can_create_os = TRUE,
  can_create_operational_detail = TRUE,
  can_manage_reservations = TRUE,
  can_manage_checkins = TRUE,
  can_view_reports = TRUE,
  updated_at = CURRENT_TIMESTAMP;

-- regianebrunno@gmail.com - Apenas visualizar e baixar
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports
) 
SELECT 
  u.id, u.email, 7,
  FALSE, FALSE,
  TRUE, TRUE, TRUE,
  FALSE, FALSE,
  TRUE, TRUE, TRUE
FROM users u
WHERE u.email = 'regianebrunno@gmail.com'
ON DUPLICATE KEY UPDATE
  can_edit_os = FALSE,
  can_edit_operational_detail = FALSE,
  can_view_os = TRUE,
  can_download_os = TRUE,
  can_view_operational_detail = TRUE,
  can_create_os = FALSE,
  can_create_operational_detail = FALSE,
  can_manage_reservations = TRUE,
  can_manage_checkins = TRUE,
  can_view_reports = TRUE,
  updated_at = CURRENT_TIMESTAMP;

-- franciely.mendes@ideiaum.com.br - Apenas visualizar e baixar
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports
) 
SELECT 
  u.id, u.email, 7,
  FALSE, FALSE,
  TRUE, TRUE, TRUE,
  FALSE, FALSE,
  TRUE, TRUE, TRUE
FROM users u
WHERE u.email = 'franciely.mendes@ideiaum.com.br'
ON DUPLICATE KEY UPDATE
  can_edit_os = FALSE,
  can_edit_operational_detail = FALSE,
  can_view_os = TRUE,
  can_download_os = TRUE,
  can_view_operational_detail = TRUE,
  can_create_os = FALSE,
  can_create_operational_detail = FALSE,
  can_manage_reservations = TRUE,
  can_manage_checkins = TRUE,
  can_view_reports = TRUE,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================

-- Verificar tabelas criadas
SELECT 'Tabelas criadas:' as info;
SHOW TABLES LIKE '%permission%';

-- Verificar permissões inseridas
SELECT 
  'Permissões inseridas:' as info,
  uep.id,
  uep.user_email,
  uep.establishment_id,
  p.name as establishment_name,
  uep.can_edit_os,
  uep.can_edit_operational_detail,
  uep.can_view_os,
  uep.can_download_os,
  uep.is_active
FROM user_establishment_permissions uep
LEFT JOIN places p ON uep.establishment_id = p.id
ORDER BY uep.user_email, uep.establishment_id;

