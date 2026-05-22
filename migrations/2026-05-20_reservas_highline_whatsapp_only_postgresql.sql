-- reservas@highlinebar.com.br: garante linha de permissão no HighLine (places.id = 7).
-- Escopo do inbox WhatsApp é aplicado na API (whatsappAdmin), não zerando outros módulos.
-- Ver também: 2026-05-21_restore_reservas_highline_full_access_postgresql.sql
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
  can_manage_reservations = TRUE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;
