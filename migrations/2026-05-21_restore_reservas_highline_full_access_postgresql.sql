-- Restaura permissões de reservas@highlinebar.com.br após migration restritiva de WhatsApp.
-- Mantém escopo do inbox na API (whatsappAdmin); no admin web volta cardápio, reservas e check-in.

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
  can_view_cardapio,
  can_create_cardapio,
  can_edit_cardapio,
  can_delete_cardapio,
  is_active
)
SELECT
  u.id,
  u.email,
  7,
  FALSE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  TRUE
FROM users u
WHERE LOWER(u.email) = 'reservas@highlinebar.com.br'
ON CONFLICT (user_id, establishment_id) DO UPDATE SET
  can_edit_operational_detail = TRUE,
  can_view_os = TRUE,
  can_download_os = TRUE,
  can_view_operational_detail = TRUE,
  can_manage_reservations = TRUE,
  can_manage_checkins = TRUE,
  can_view_reports = TRUE,
  can_create_edit_reservations = TRUE,
  can_view_cardapio = TRUE,
  can_create_cardapio = TRUE,
  can_edit_cardapio = TRUE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;
