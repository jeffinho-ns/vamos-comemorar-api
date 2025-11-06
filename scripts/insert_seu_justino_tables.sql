-- Popular mesas do Seu Justino usando mapeamento rápido de áreas
-- Lounge -> area_id = 1 (Área Coberta)
-- Quintal -> area_id = 2 (Área Descoberta)
--
-- Certifique-se de executar antes a criação da tabela restaurant_tables (é criada automaticamente pela rota /api/restaurant-tables)

-- LOUNGE (area_id = 1)
INSERT INTO restaurant_tables (area_id, table_number, capacity, table_type, description, is_active) VALUES
-- Lounge Bar: 200, 202
(1, '200', 4, 'lounge_bar', 'Mesa Lounge Bar - Seu Justino', 1),
(1, '202', 4, 'lounge_bar', 'Mesa Lounge Bar - Seu Justino', 1),
-- Lounge Palco: 204, 206
(1, '204', 4, 'lounge_palco', 'Mesa Lounge Palco - Seu Justino', 1),
(1, '206', 4, 'lounge_palco', 'Mesa Lounge Palco - Seu Justino', 1),
-- Lounge Aquário TV: 208
(1, '208', 4, 'lounge_aquario_tv', 'Mesa Lounge Aquário TV - Seu Justino', 1),
-- Lounge Aquário Spaten: 210
(1, '210', 4, 'lounge_aquario_spaten', 'Mesa Lounge Aquário Spaten - Seu Justino', 1);

-- QUINTAL (area_id = 2)
INSERT INTO restaurant_tables (area_id, table_number, capacity, table_type, description, is_active) VALUES
-- Quintal Lateral Esquerdo: 20, 22, 24, 26, 28, 29
(2, '20', 4, 'quintal_lateral', 'Mesa Quintal Lateral Esquerdo - Seu Justino', 1),
(2, '22', 4, 'quintal_lateral', 'Mesa Quintal Lateral Esquerdo - Seu Justino', 1),
(2, '24', 4, 'quintal_lateral', 'Mesa Quintal Lateral Esquerdo - Seu Justino', 1),
(2, '26', 4, 'quintal_lateral', 'Mesa Quintal Lateral Esquerdo - Seu Justino', 1),
(2, '28', 4, 'quintal_lateral', 'Mesa Quintal Lateral Esquerdo - Seu Justino', 1),
(2, '29', 4, 'quintal_lateral', 'Mesa Quintal Lateral Esquerdo - Seu Justino', 1),
-- Quintal Central Esquerdo: 30, 32, 34, 36, 38, 39
(2, '30', 4, 'quintal_central', 'Mesa Quintal Central Esquerdo - Seu Justino', 1),
(2, '32', 4, 'quintal_central', 'Mesa Quintal Central Esquerdo - Seu Justino', 1),
(2, '34', 4, 'quintal_central', 'Mesa Quintal Central Esquerdo - Seu Justino', 1),
(2, '36', 4, 'quintal_central', 'Mesa Quintal Central Esquerdo - Seu Justino', 1),
(2, '38', 4, 'quintal_central', 'Mesa Quintal Central Esquerdo - Seu Justino', 1),
(2, '39', 4, 'quintal_central', 'Mesa Quintal Central Esquerdo - Seu Justino', 1),
-- Quintal Central Direito: 40, 42, 44, 46, 48
(2, '40', 4, 'quintal_central', 'Mesa Quintal Central Direito - Seu Justino', 1),
(2, '42', 4, 'quintal_central', 'Mesa Quintal Central Direito - Seu Justino', 1),
(2, '44', 4, 'quintal_central', 'Mesa Quintal Central Direito - Seu Justino', 1),
(2, '46', 4, 'quintal_central', 'Mesa Quintal Central Direito - Seu Justino', 1),
(2, '48', 4, 'quintal_central', 'Mesa Quintal Central Direito - Seu Justino', 1),
-- Quintal Lateral Direito: 50, 52, 54, 56, 58, 60, 62, 64
(2, '50', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1),
(2, '52', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1),
(2, '54', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1),
(2, '56', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1),
(2, '58', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1),
(2, '60', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1),
(2, '62', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1),
(2, '64', 4, 'quintal_lateral', 'Mesa Quintal Lateral Direito - Seu Justino', 1);

