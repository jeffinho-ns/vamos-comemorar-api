-- Faixa (De/até) e promoção (Por) dos itens do cardápio.
-- price_from = Preço De, price_to = Preço Por.
-- Os dois vazios: a página pública mostra só price.

ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS price_from NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS price_to NUMERIC(10, 2);

COMMENT ON COLUMN menu_items.price_from IS 'Preço De. Com price_to maior, a página pública mostra a faixa De até Por.';
COMMENT ON COLUMN menu_items.price_to IS 'Preço Por. Menor que price vira promoção; maior que price_from vira faixa.';
