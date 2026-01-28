-- =====================================================
-- MIGRAÇÃO: QR Code por convidado (guests)
-- Adiciona qr_code_token (único), is_owner na tabela guests
-- Para check-in via QR individual por convidado
-- =====================================================

-- PostgreSQL
DO $$ 
BEGIN
    -- Adicionar coluna qr_code_token se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = current_schema()
        AND table_name = 'guests' 
        AND column_name = 'qr_code_token'
    ) THEN
        ALTER TABLE guests 
        ADD COLUMN qr_code_token VARCHAR(64);
    END IF;

    -- Adicionar coluna is_owner se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = current_schema()
        AND table_name = 'guests' 
        AND column_name = 'is_owner'
    ) THEN
        ALTER TABLE guests 
        ADD COLUMN is_owner BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Índice único para busca por token (permite vários NULL; valores não-nulos únicos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_qr_code_token ON guests(qr_code_token) WHERE qr_code_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_is_owner ON guests(is_owner);
