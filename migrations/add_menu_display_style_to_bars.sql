-- Adiciona coluna para definir o estilo de exibição do cardápio por estabelecimento
ALTER TABLE `bars`
  ADD COLUMN `menu_display_style` VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT 'Define o estilo do cardápio: normal ou clean';

-- Define o estilo clean por padrão para o Reserva Rooftop
UPDATE `bars`
SET `menu_display_style` = 'clean'
WHERE `slug` = 'reserva-rooftop';

