-- ============================================================
-- Adiciona coluna can_create_edit_reservations em user_establishment_permissions
-- Quando FALSE: usuário pode apenas visualizar, fazer check-in, check-out e alocar mesa.
-- Quando TRUE: pode também criar/editar/excluir reservas e lista de espera.
-- ============================================================

ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS can_create_edit_reservations BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN user_establishment_permissions.can_create_edit_reservations IS
  'Pode criar, editar e excluir reservas e lista de espera. Se FALSE, apenas visualizar, check-in, check-out e alocar mesa.';

-- Garantir que registros existentes continuem com acesso total
UPDATE user_establishment_permissions
  SET can_create_edit_reservations = COALESCE(can_create_edit_reservations, TRUE)
  WHERE can_create_edit_reservations IS NULL;
