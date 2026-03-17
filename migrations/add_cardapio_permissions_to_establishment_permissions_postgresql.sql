-- ============================================================
-- MIGRAÇÃO: Permissões de Cardápio por Estabelecimento
-- Versão PostgreSQL
-- ============================================================
-- Descrição: adiciona flags de cardápio na tabela user_establishment_permissions
-- Data: 2026-03-17
-- ============================================================

ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS can_view_cardapio BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_create_cardapio BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_edit_cardapio BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_delete_cardapio BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN user_establishment_permissions.can_view_cardapio IS 'Pode acessar/visualizar o admin de Cardápio do estabelecimento';
COMMENT ON COLUMN user_establishment_permissions.can_create_cardapio IS 'Pode criar categorias/itens no cardápio do estabelecimento';
COMMENT ON COLUMN user_establishment_permissions.can_edit_cardapio IS 'Pode editar categorias/itens no cardápio do estabelecimento';
COMMENT ON COLUMN user_establishment_permissions.can_delete_cardapio IS 'Pode excluir (soft delete) categorias/itens no cardápio do estabelecimento';

-- Garantir que permissões existentes continuem funcionando (backward compatibility)
-- Se já houver registros antigos, manter como TRUE (default) para não quebrar acesso atual.
UPDATE user_establishment_permissions
SET
  can_view_cardapio = COALESCE(can_view_cardapio, TRUE),
  can_create_cardapio = COALESCE(can_create_cardapio, TRUE),
  can_edit_cardapio = COALESCE(can_edit_cardapio, TRUE),
  can_delete_cardapio = COALESCE(can_delete_cardapio, TRUE);

