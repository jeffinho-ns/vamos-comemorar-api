-- =====================================================
-- Migração: Limites VIP Noite Tuda e campo vip_tipo
-- Data: 2026-02
-- Descrição:
--   1. gift_rules: vip_m_limit, vip_f_limit (cotas por promoter)
--   2. promoter_convidados: vip_tipo ('M'|'F'|NULL)
--   3. listas_convidados: vip_tipo ('M'|'F'|NULL) para check-in
-- Executar no mesmo banco/schema onde estão as tabelas.
-- Se usar schema meu_backup_db, executar com: SET search_path TO meu_backup_db, public;
-- =====================================================

-- 1. gift_rules: limites VIP Masculino e Feminino
ALTER TABLE gift_rules
  ADD COLUMN IF NOT EXISTS vip_m_limit INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_f_limit INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN gift_rules.vip_m_limit IS 'Limite de convidados VIP Noite Tuda masculino por promoter (0 = sem cota)';
COMMENT ON COLUMN gift_rules.vip_f_limit IS 'Limite de convidados VIP Noite Tuda feminino por promoter (0 = sem cota)';

-- 2. promoter_convidados: vip_tipo
ALTER TABLE promoter_convidados
  ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL;

-- 3. listas_convidados: vip_tipo (para check-in)
ALTER TABLE listas_convidados
  ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL;

-- Se as tabelas estiverem no schema meu_backup_db (recomendado para a API), execute:
ALTER TABLE meu_backup_db.promoter_convidados ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL;
ALTER TABLE meu_backup_db.listas_convidados ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL;
