-- ============================================================================
-- SaaS — 022: organization_id na tabela eventos (legado id_place)
-- ============================================================================

SET search_path TO meu_backup_db, public;

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS organization_id integer;
CREATE INDEX IF NOT EXISTS idx_eventos_organization_id ON eventos(organization_id);
