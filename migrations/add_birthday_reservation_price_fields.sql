-- =====================================================
-- MIGRAÇÃO: Campos de Preço e Dados Completos para Reservas de Aniversário
-- Adiciona campos para salvar preços e dados completos dos itens
-- =====================================================

-- Adicionar campos se não existirem (PostgreSQL)
DO $$ 
BEGIN
    -- Adicionar decoracao_preco
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'birthday_reservations' 
        AND column_name = 'decoracao_preco'
    ) THEN
        ALTER TABLE birthday_reservations 
        ADD COLUMN decoracao_preco DECIMAL(10,2) DEFAULT NULL;
    END IF;

    -- Adicionar decoracao_imagem
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'birthday_reservations' 
        AND column_name = 'decoracao_imagem'
    ) THEN
        ALTER TABLE birthday_reservations 
        ADD COLUMN decoracao_imagem TEXT DEFAULT NULL;
    END IF;

    -- Adicionar bebidas_completas (JSON)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'birthday_reservations' 
        AND column_name = 'bebidas_completas'
    ) THEN
        ALTER TABLE birthday_reservations 
        ADD COLUMN bebidas_completas JSONB DEFAULT NULL;
    END IF;

    -- Adicionar comidas_completas (JSON)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'birthday_reservations' 
        AND column_name = 'comidas_completas'
    ) THEN
        ALTER TABLE birthday_reservations 
        ADD COLUMN comidas_completas JSONB DEFAULT NULL;
    END IF;
END $$;

-- Criar comentários nas colunas
COMMENT ON COLUMN birthday_reservations.decoracao_preco IS 'Preço da decoração selecionada';
COMMENT ON COLUMN birthday_reservations.decoracao_imagem IS 'URL da imagem da decoração selecionada';
COMMENT ON COLUMN birthday_reservations.bebidas_completas IS 'Array JSON com dados completos das bebidas selecionadas (nome, preço, quantidade)';
COMMENT ON COLUMN birthday_reservations.comidas_completas IS 'Array JSON com dados completos das comidas selecionadas (nome, preço, quantidade)';

