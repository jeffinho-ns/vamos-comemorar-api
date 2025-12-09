-- ========================================
-- Migration: Adicionar campo visible em event_items
-- Data: 2025-01-XX
-- Descrição: Permite controlar quais itens aparecem no cardápio do evento
-- ========================================

-- Schema usado no projeto
SET search_path TO meu_backup_db, public;

-- Adicionar coluna visible na tabela event_items
ALTER TABLE meu_backup_db.event_items 
ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT TRUE;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_event_items_visible 
  ON meu_backup_db.event_items(event_id, visible) 
  WHERE visible = true;

-- Comentário
COMMENT ON COLUMN meu_backup_db.event_items.visible IS 'Controla se o item aparece no cardápio do evento (true = visível, false = oculto)';

-- Atualizar todos os registros existentes para visíveis por padrão
UPDATE meu_backup_db.event_items SET visible = TRUE WHERE visible IS NULL;

