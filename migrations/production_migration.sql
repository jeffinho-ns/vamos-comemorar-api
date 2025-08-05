-- Migração para produção - Aplicar no banco do Render
-- Execute este script no banco de dados de produção

-- 1. Alterar o tipo da coluna decoracao_tipo para aceitar os novos nomes
ALTER TABLE birthday_reservations MODIFY COLUMN decoracao_tipo VARCHAR(255);

-- 2. Adicionar novos campos para bebidas do bar (10 itens)
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_1 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_2 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_3 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_4 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_5 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_6 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_7 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_8 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_9 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_bebida_10 INT DEFAULT 0;

-- 3. Adicionar novos campos para comidas do bar (10 itens)
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_1 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_2 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_3 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_4 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_5 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_6 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_7 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_8 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_9 INT DEFAULT 0;
ALTER TABLE birthday_reservations ADD COLUMN item_bar_comida_10 INT DEFAULT 0;

-- 4. Adicionar campo para lista de presentes (JSON)
ALTER TABLE birthday_reservations ADD COLUMN lista_presentes JSON;

-- 5. Adicionar campos de contato
ALTER TABLE birthday_reservations ADD COLUMN documento VARCHAR(255);
ALTER TABLE birthday_reservations ADD COLUMN whatsapp VARCHAR(255);
ALTER TABLE birthday_reservations ADD COLUMN email VARCHAR(255); 