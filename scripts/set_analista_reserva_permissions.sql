-- ============================================================
-- Script para configurar permissões do usuário analista@reserva.com
-- Este script garante que o usuário veja APENAS o estabelecimento "Reserva Rooftop"
-- ============================================================

-- Passo 1: Verificar se o usuário existe
SELECT 'Verificando usuário...' as status;
SELECT id, email, name FROM users WHERE email = 'analista@reserva.com';

-- Passo 2: Verificar qual é o ID do estabelecimento "Reserva Rooftop"
SELECT 'Verificando estabelecimento Reserva Rooftop...' as status;
SELECT id, name FROM places WHERE LOWER(name) LIKE '%reserva%rooftop%' OR LOWER(name) LIKE '%rooftop%';

-- Passo 3: Remover todas as permissões existentes do usuário (para garantir que veja apenas Reserva Rooftop)
SELECT 'Removendo permissões existentes...' as status;
DELETE FROM user_establishment_permissions 
WHERE user_email = 'analista@reserva.com';

-- Passo 4: Inserir permissão apenas para Reserva Rooftop com acesso completo
SELECT 'Criando permissão para Reserva Rooftop...' as status;
INSERT INTO user_establishment_permissions (
  user_id, 
  user_email, 
  establishment_id,
  can_edit_os, 
  can_edit_operational_detail,
  can_view_os, 
  can_download_os, 
  can_view_operational_detail,
  can_create_os, 
  can_create_operational_detail,
  can_manage_reservations, 
  can_manage_checkins, 
  can_view_reports,
  is_active,
  created_at,
  updated_at
) 
SELECT 
  u.id,
  u.email,
  p.id as establishment_id,
  TRUE as can_edit_os,
  TRUE as can_edit_operational_detail,
  TRUE as can_view_os,
  TRUE as can_download_os,
  TRUE as can_view_operational_detail,
  TRUE as can_create_os,
  TRUE as can_create_operational_detail,
  TRUE as can_manage_reservations,
  TRUE as can_manage_checkins,
  TRUE as can_view_reports,
  TRUE as is_active,
  CURRENT_TIMESTAMP as created_at,
  CURRENT_TIMESTAMP as updated_at
FROM users u
CROSS JOIN places p
WHERE u.email = 'analista@reserva.com'
  AND (LOWER(p.name) LIKE '%reserva%rooftop%' OR LOWER(p.name) LIKE '%rooftop%')
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
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;

-- 3. Verificar as permissões criadas
SELECT 
  uep.id,
  u.name as user_name,
  u.email as user_email,
  COALESCE(p.name, b.name) as establishment_name,
  uep.establishment_id,
  uep.can_edit_os,
  uep.can_edit_operational_detail,
  uep.can_view_os,
  uep.can_download_os,
  uep.can_view_operational_detail,
  uep.can_create_os,
  uep.can_create_operational_detail,
  uep.can_manage_reservations,
  uep.can_manage_checkins,
  uep.can_view_reports,
  uep.is_active
FROM user_establishment_permissions uep
LEFT JOIN users u ON uep.user_id = u.id
LEFT JOIN places p ON uep.establishment_id = p.id
LEFT JOIN bars b ON uep.establishment_id = b.id
WHERE uep.user_email = 'analista@reserva.com'
ORDER BY COALESCE(p.name, b.name);
