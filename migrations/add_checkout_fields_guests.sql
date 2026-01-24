-- =====================================================
-- MIGRAÇÃO: Campos de Check-out para Guests
-- Adiciona campos checked_out e checkout_time na tabela guests
-- Execute este script para habilitar o sistema de check-out
-- =====================================================

-- Para PostgreSQL
DO $$ 
BEGIN
    -- Adicionar coluna checked_out se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'guests' 
        AND column_name = 'checked_out'
    ) THEN
        ALTER TABLE guests 
        ADD COLUMN checked_out BOOLEAN DEFAULT FALSE;
    END IF;

    -- Adicionar coluna checkout_time se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'guests' 
        AND column_name = 'checkout_time'
    ) THEN
        ALTER TABLE guests 
        ADD COLUMN checkout_time TIMESTAMP NULL DEFAULT NULL;
    END IF;

    -- Criar índices para melhor performance
    CREATE INDEX IF NOT EXISTS idx_guests_checked_out ON guests(checked_out);
    CREATE INDEX IF NOT EXISTS idx_guests_checkout_time ON guests(checkout_time);
    CREATE INDEX IF NOT EXISTS idx_guests_checkin_checkout ON guests(checked_in, checked_out);
END $$;

-- Verificar se os campos foram criados
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'guests'
AND column_name IN ('checked_out', 'checkout_time')
ORDER BY column_name;
