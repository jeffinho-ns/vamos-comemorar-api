-- ============================================================================
-- SaaS Multi-Tenant — Fase 5 / 009: mensalidade manual por empresa
-- ----------------------------------------------------------------------------
-- Adiciona override de mensalidade em subscriptions para refletir a receita real
-- por organização sem depender de gateway.
-- ============================================================================

SET search_path TO meu_backup_db, public;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS monthly_amount_cents INTEGER NULL;

COMMENT ON COLUMN subscriptions.monthly_amount_cents IS
  'Mensalidade manual por organização (override do plano) usada no MRR/receita do Super Admin.';
