-- ============================================================================
-- SaaS Multi-Tenant — Fase 6 / 010: materiais de treinamento
-- ============================================================================

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS training_materials (
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  content_type    VARCHAR(30) NOT NULL DEFAULT 'link',
  url             VARCHAR(500),
  module_key      VARCHAR(40),
  plan_key        VARCHAR(40),
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  is_published    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_materials_org ON training_materials(organization_id);
CREATE INDEX IF NOT EXISTS idx_training_materials_module ON training_materials(module_key);
