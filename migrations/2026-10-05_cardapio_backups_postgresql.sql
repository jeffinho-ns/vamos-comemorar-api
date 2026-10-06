-- Backup de segurança do cardápio, por estabelecimento.
-- O snapshot guarda categorias, itens e complementos para restaurar
-- uma exclusão acidental a partir deste ponto.

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS cardapio_backups (
  id BIGSERIAL PRIMARY KEY,
  bar_id INTEGER NOT NULL,
  organization_id INTEGER,
  created_by INTEGER,
  created_by_name TEXT,
  label TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual',
  snapshot JSONB NOT NULL,
  category_count INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cardapio_backups_reason_check CHECK (reason IN ('manual', 'pre_restore'))
);

CREATE INDEX IF NOT EXISTS idx_cardapio_backups_bar_created
  ON cardapio_backups (bar_id, created_at DESC);
