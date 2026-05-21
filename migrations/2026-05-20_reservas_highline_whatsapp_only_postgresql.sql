-- reservas@highlinebar.com.br: inbox WhatsApp apenas do HighLine (places.id = 7)
-- Executar após create_establishment_permissions_system_postgresql.sql

ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS can_create_edit_reservations BOOLEAN DEFAULT TRUE;

UPDATE user_establishment_permissions
  SET can_create_edit_reservations = COALESCE(can_create_edit_reservations, TRUE)
  WHERE can_create_edit_reservations IS NULL;

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
  can_create_edit_reservations,
  is_active
)
SELECT
  u.id,
  u.email,
  7,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  TRUE
FROM users u
WHERE LOWER(u.email) = 'reservas@highlinebar.com.br'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_os = FALSE,
  can_edit_operational_detail = FALSE,
  can_view_os = FALSE,
  can_download_os = FALSE,
  can_view_operational_detail = FALSE,
  can_create_os = FALSE,
  can_create_operational_detail = FALSE,
  can_manage_reservations = TRUE,
  can_manage_checkins = FALSE,
  can_view_reports = FALSE,
  can_create_edit_reservations = FALSE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;
