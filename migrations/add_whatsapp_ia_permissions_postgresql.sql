-- Permissões granulares: atendimento WhatsApp e configuração de IA por estabelecimento
ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS can_manage_whatsapp BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_ia BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_establishment_permissions.can_manage_whatsapp IS
  'Pode acessar inbox de atendimento WhatsApp do estabelecimento';
COMMENT ON COLUMN user_establishment_permissions.can_configure_ia IS
  'Pode configurar e treinar a IA de atendimento do estabelecimento';

-- Quem já gerenciava reservas mantém atendimento WhatsApp (comportamento legado)
UPDATE user_establishment_permissions
   SET can_manage_whatsapp = TRUE
 WHERE can_manage_reservations = TRUE
   AND COALESCE(can_manage_whatsapp, FALSE) = FALSE;
