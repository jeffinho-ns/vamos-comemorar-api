-- ============================================================================
-- SaaS Multi-Tenant — Fase 1 / 003: flag is_super_admin em users (ADITIVO)
-- ----------------------------------------------------------------------------
-- Substitui a lista de e-mails hardcoded (config/superAdmins.js) por uma flag
-- no banco. Coluna nasce nullable/default FALSE — não muda nada do legado.
-- ⚠️ NÃO EXECUTAR EM PRODUÇÃO sem staging + backup.
-- ============================================================================

SET search_path TO meu_backup_db, public;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill seguro a partir da lista atual (NÃO remove a lista ainda — fase Contract).
-- Ajuste/expanda os e-mails conforme config/superAdmins.js antes de rodar.
UPDATE users
   SET is_super_admin = TRUE
 WHERE lower(email) IN (
   'jeffinho_ns@hotmail.com'
 )
   AND is_super_admin = FALSE;
