-- Migração para adicionar campos de check-in
-- Data: 2024-12-19

-- Adicionar campos de check-in na tabela guest_lists
ALTER TABLE guest_lists 
ADD COLUMN owner_checked_in TINYINT(1) DEFAULT 0,
ADD COLUMN owner_checkin_time DATETIME NULL;

-- Adicionar campos de check-in na tabela guests
ALTER TABLE guests 
ADD COLUMN checked_in TINYINT(1) DEFAULT 0,
ADD COLUMN checkin_time DATETIME NULL;

-- Criar índices para melhorar performance
CREATE INDEX idx_guest_lists_owner_checkin ON guest_lists(owner_checked_in);
CREATE INDEX idx_guests_checkin ON guests(checked_in);
CREATE INDEX idx_guests_checkin_time ON guests(checkin_time);

-- Comentários para documentação
ALTER TABLE guest_lists 
COMMENT = 'Tabela de listas de convidados com campos de check-in do dono';

ALTER TABLE guests 
COMMENT = 'Tabela de convidados com campos de check-in individual';
