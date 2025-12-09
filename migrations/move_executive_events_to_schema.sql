-- ========================================
-- Mover tabelas de Executive Events para schema meu_backup_db
-- ========================================

-- Mover executive_events
ALTER TABLE executive_events SET SCHEMA meu_backup_db;

-- Mover event_settings
ALTER TABLE event_settings SET SCHEMA meu_backup_db;

-- Mover event_items
ALTER TABLE event_items SET SCHEMA meu_backup_db;

-- Mover event_seals
ALTER TABLE event_seals SET SCHEMA meu_backup_db;

-- Atualizar triggers (se necessário)
-- Os triggers já devem estar funcionando pois referenciam as tabelas

