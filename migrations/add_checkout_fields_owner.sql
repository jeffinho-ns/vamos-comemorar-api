-- =====================================================
-- MIGRAÇÃO: Campos de Check-out para Owner (Dono)
-- Adiciona campos owner_checked_out e owner_checkout_time na tabela guest_lists
-- Execute este script para habilitar o sistema de check-out do dono
-- =====================================================

-- Para PostgreSQL
DO $$ 
BEGIN
    -- Adicionar coluna owner_checked_out se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'guest_lists' 
        AND column_name = 'owner_checked_out'
    ) THEN
        ALTER TABLE guest_lists 
        ADD COLUMN owner_checked_out BOOLEAN DEFAULT FALSE;
    END IF;

    -- Adicionar coluna owner_checkout_time se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'guest_lists' 
        AND column_name = 'owner_checkout_time'
    ) THEN
        ALTER TABLE guest_lists 
        ADD COLUMN owner_checkout_time TIMESTAMP NULL DEFAULT NULL;
    END IF;

    -- Criar índices para melhor performance
    CREATE INDEX IF NOT EXISTS idx_guest_lists_owner_checked_out ON guest_lists(owner_checked_out);
    CREATE INDEX IF NOT EXISTS idx_guest_lists_owner_checkout_time ON guest_lists(owner_checkout_time);
    CREATE INDEX IF NOT EXISTS idx_guest_lists_owner_checkin_checkout ON guest_lists(owner_checked_in, owner_checked_out);
END $$;

-- Verificar se os campos foram criados
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'guest_lists'
AND column_name IN ('owner_checked_out', 'owner_checkout_time')
ORDER BY column_name;
