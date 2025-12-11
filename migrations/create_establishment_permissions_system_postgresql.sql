-- ============================================================
-- MIGRAÇÃO: Sistema de Permissões por Estabelecimento
-- Versão PostgreSQL
-- ============================================================
-- Descrição: Cria tabelas para gerenciar permissões de usuários por estabelecimento
-- Data: 2025-01-XX
-- ============================================================

-- Tabela principal de permissões de usuário por estabelecimento
CREATE TABLE IF NOT EXISTS user_establishment_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  establishment_id INTEGER NOT NULL,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  CONSTRAINT unique_user_establishment UNIQUE (user_id, establishment_id),
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_permissions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_permissions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_user_establishment_permissions_user_id ON user_establishment_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_establishment_permissions_user_email ON user_establishment_permissions(user_email);
CREATE INDEX IF NOT EXISTS idx_user_establishment_permissions_establishment_id ON user_establishment_permissions(establishment_id);
CREATE INDEX IF NOT EXISTS idx_user_establishment_permissions_is_active ON user_establishment_permissions(is_active);

-- Comentários
COMMENT ON TABLE user_establishment_permissions IS 'Permissões de usuários por estabelecimento';
COMMENT ON COLUMN user_establishment_permissions.can_edit_os IS 'Pode editar OS de Artista/Banda/DJ';
COMMENT ON COLUMN user_establishment_permissions.can_edit_operational_detail IS 'Pode editar Detalhes Operacionais';
COMMENT ON COLUMN user_establishment_permissions.can_view_os IS 'Pode visualizar OS';
COMMENT ON COLUMN user_establishment_permissions.can_download_os IS 'Pode baixar/exportar OS';
COMMENT ON COLUMN user_establishment_permissions.can_create_os IS 'Pode criar OS';
COMMENT ON COLUMN user_establishment_permissions.can_create_operational_detail IS 'Pode criar Detalhes Operacionais';

-- Tabela de logs de auditoria de permissões
CREATE TABLE IF NOT EXISTS permission_audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  permission_id INTEGER,
  target_user_id INTEGER,
  target_user_email VARCHAR(255),
  establishment_id INTEGER,
  permission_changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_permission_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_permission_audit_permission FOREIGN KEY (permission_id) REFERENCES user_establishment_permissions(id) ON DELETE SET NULL
);

-- Criar índices para logs
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_user_id ON permission_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_action_type ON permission_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_target_user_id ON permission_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_establishment_id ON permission_audit_logs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_created_at ON permission_audit_logs(created_at);

COMMENT ON TABLE permission_audit_logs IS 'Logs de auditoria de alterações em permissões';
COMMENT ON COLUMN permission_audit_logs.action_type IS 'Tipo de ação: CREATE, UPDATE, DELETE, VIEW';
COMMENT ON COLUMN permission_audit_logs.permission_changes IS 'JSON com as mudanças realizadas';

-- Tabela de configurações de permissões padrão por role
CREATE TABLE IF NOT EXISTS role_permission_templates (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL,
  establishment_id INTEGER,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_role_establishment UNIQUE (role_name, establishment_id)
);

COMMENT ON TABLE role_permission_templates IS 'Templates de permissões padrão por role e estabelecimento';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_user_establishment_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_establishment_permissions_updated_at ON user_establishment_permissions;
CREATE TRIGGER update_user_establishment_permissions_updated_at
    BEFORE UPDATE ON user_establishment_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_establishment_permissions_updated_at();

-- ============================================================
-- INSERIR DADOS INICIAIS (Migração dos dados existentes)
-- ============================================================

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
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
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
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
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
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
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

