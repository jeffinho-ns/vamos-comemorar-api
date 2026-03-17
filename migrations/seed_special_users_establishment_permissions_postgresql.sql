-- ============================================================
-- Migração: Inserir permissões para usuários com acesso especial
-- (antes hardcoded no front e na API)
-- Executar após create_establishment_permissions_system e
-- add_can_create_edit_reservations_postgresql
-- ============================================================

-- Garantir coluna can_create_edit_reservations (idempotente)
ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS can_create_edit_reservations BOOLEAN DEFAULT TRUE;
UPDATE user_establishment_permissions
  SET can_create_edit_reservations = COALESCE(can_create_edit_reservations, TRUE)
  WHERE can_create_edit_reservations IS NULL;

-- Helena / analista.mkt03@ideiaum.com.br → Pracinha do Seu Justino (place id 8)
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 8,
  FALSE, FALSE,
  TRUE, TRUE, TRUE,
  FALSE, FALSE,
  TRUE, TRUE, TRUE,
  TRUE, TRUE
FROM users u
WHERE LOWER(u.email) = 'analista.mkt03@ideiaum.com.br'
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
  can_create_edit_reservations = TRUE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;

-- Analista Pracinha → Pracinha (8)
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 8,
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE LOWER(u.email) = 'analista@pracinha.com'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_os = TRUE, can_edit_operational_detail = TRUE,
  can_view_os = TRUE, can_download_os = TRUE, can_view_operational_detail = TRUE,
  can_create_os = TRUE, can_create_operational_detail = TRUE,
  can_manage_reservations = TRUE, can_manage_checkins = TRUE, can_view_reports = TRUE,
  can_create_edit_reservations = TRUE, is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

-- Analista Seu Justino → Seu Justino (1)
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE LOWER(u.email) = 'analista@seujustino.com'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_os = TRUE, can_edit_operational_detail = TRUE,
  can_view_os = TRUE, can_download_os = TRUE, can_view_operational_detail = TRUE,
  can_create_os = TRUE, can_create_operational_detail = TRUE,
  can_manage_reservations = TRUE, can_manage_checkins = TRUE, can_view_reports = TRUE,
  can_create_edit_reservations = TRUE, is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

-- Analista Oh Fregues → Oh Fregues (2)
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE LOWER(u.email) = 'analista@ohfregues.com'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_os = TRUE, can_edit_operational_detail = TRUE,
  can_view_os = TRUE, can_download_os = TRUE, can_view_operational_detail = TRUE,
  can_create_os = TRUE, can_create_operational_detail = TRUE,
  can_manage_reservations = TRUE, can_manage_checkins = TRUE, can_view_reports = TRUE,
  can_create_edit_reservations = TRUE, is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

-- Analista HighLine → HighLine (3)
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 3, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE LOWER(u.email) = 'analista@highline.com'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_os = TRUE, can_edit_operational_detail = TRUE,
  can_view_os = TRUE, can_download_os = TRUE, can_view_operational_detail = TRUE,
  can_create_os = TRUE, can_create_operational_detail = TRUE,
  can_manage_reservations = TRUE, can_manage_checkins = TRUE, can_view_reports = TRUE,
  can_create_edit_reservations = TRUE, is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

-- Fran HighLine
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 3, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE LOWER(u.email) = 'fran@highlinebar.com.br'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_os = TRUE, can_edit_operational_detail = TRUE,
  can_view_os = TRUE, can_download_os = TRUE, can_view_operational_detail = TRUE,
  can_create_os = TRUE, can_create_operational_detail = TRUE,
  can_manage_reservations = TRUE, can_manage_checkins = TRUE, can_view_reports = TRUE,
  can_create_edit_reservations = TRUE, is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

-- Analista Reserva Rooftop → Reserva Rooftop (5)
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 5, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE LOWER(u.email) = 'analista@reserva.com'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_os = TRUE, can_edit_operational_detail = TRUE,
  can_view_os = TRUE, can_download_os = TRUE, can_view_operational_detail = TRUE,
  can_create_os = TRUE, can_create_operational_detail = TRUE,
  can_manage_reservations = TRUE, can_manage_checkins = TRUE, can_view_reports = TRUE,
  can_create_edit_reservations = TRUE, is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

-- Gerentes Seu Justino (cardápio) → Seu Justino (1)
INSERT INTO user_establishment_permissions (
  user_id, user_email, establishment_id,
  can_edit_os, can_edit_operational_detail,
  can_view_os, can_download_os, can_view_operational_detail,
  can_create_os, can_create_operational_detail,
  can_manage_reservations, can_manage_checkins, can_view_reports,
  can_create_edit_reservations, is_active
)
SELECT u.id, u.email, 1,
  FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE,
  TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
WHERE LOWER(u.email) IN ('gerente.sjm@seujustino.com.br', 'subgerente.sjm@seujustino.com.br')
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_manage_reservations = TRUE, can_manage_checkins = TRUE, can_view_reports = TRUE,
  can_view_os = TRUE, can_download_os = TRUE, can_view_operational_detail = TRUE,
  can_create_edit_reservations = TRUE, is_active = TRUE, updated_at = CURRENT_TIMESTAMP;
