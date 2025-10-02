-- Popular mesas do Highline usando mapeamento rápido de áreas
-- Rooftop -> area_id = 5 (Terraço)
-- Deck    -> area_id = 2 (Área Descoberta)

-- Certifique-se de executar antes a criação da tabela restaurant_tables (é criada automaticamente pela rota /api/restaurant-tables)

-- ROOFTOP (area_id = 5)
INSERT INTO restaurant_tables (area_id, table_number, capacity, table_type, description, is_active) VALUES
-- Baixas, 2 lugares: 50-55
(5, '50', 2, 'baixa', 'Mesa baixa 2 lugares - Rooftop', 1),
(5, '51', 2, 'baixa', 'Mesa baixa 2 lugares - Rooftop', 1),
(5, '52', 2, 'baixa', 'Mesa baixa 2 lugares - Rooftop', 1),
(5, '53', 2, 'baixa', 'Mesa baixa 2 lugares - Rooftop', 1),
(5, '54', 2, 'baixa', 'Mesa baixa 2 lugares - Rooftop', 1),
(5, '55', 2, 'baixa', 'Mesa baixa 2 lugares - Rooftop', 1),
-- Altas/Bistrô, 2 lugares: 70-73
(5, '70', 2, 'alta', 'Mesa alta (bistrô) 2 lugares - Rooftop', 1),
(5, '71', 2, 'alta', 'Mesa alta (bistrô) 2 lugares - Rooftop', 1),
(5, '72', 2, 'alta', 'Mesa alta (bistrô) 2 lugares - Rooftop', 1),
(5, '73', 2, 'alta', 'Mesa alta (bistrô) 2 lugares - Rooftop', 1),
-- Centro, 6 lugares: 44-47
(5, '44', 6, 'centro', 'Mesa centro 6 lugares - Rooftop', 1),
(5, '45', 6, 'centro', 'Mesa centro 6 lugares - Rooftop', 1),
(5, '46', 6, 'centro', 'Mesa centro 6 lugares - Rooftop', 1),
(5, '47', 6, 'centro', 'Mesa centro 6 lugares - Rooftop', 1),
-- Ao redor, 10 lugares: 60-65
(5, '60', 10, 'ao_redor', 'Mesa ao redor 10 lugares - Rooftop', 1),
(5, '61', 10, 'ao_redor', 'Mesa ao redor 10 lugares - Rooftop', 1),
(5, '62', 10, 'ao_redor', 'Mesa ao redor 10 lugares - Rooftop', 1),
(5, '63', 10, 'ao_redor', 'Mesa ao redor 10 lugares - Rooftop', 1),
(5, '64', 10, 'ao_redor', 'Mesa ao redor 10 lugares - Rooftop', 1),
(5, '65', 10, 'ao_redor', 'Mesa ao redor 10 lugares - Rooftop', 1),
-- Vista, 8 lugares: 40-42
(5, '40', 8, 'vista', 'Mesa com vista 8 lugares - Rooftop', 1),
(5, '41', 8, 'vista', 'Mesa com vista 8 lugares - Rooftop', 1),
(5, '42', 8, 'vista', 'Mesa com vista 8 lugares - Rooftop', 1);

-- DECK (area_id = 2)
INSERT INTO restaurant_tables (area_id, table_number, capacity, table_type, description, is_active) VALUES
-- 8 lugares: 01-04
(2, '01', 8, 'oito', 'Mesa 8 lugares - Deck', 1),
(2, '02', 8, 'oito', 'Mesa 8 lugares - Deck', 1),
(2, '03', 8, 'oito', 'Mesa 8 lugares - Deck', 1),
(2, '04', 8, 'oito', 'Mesa 8 lugares - Deck', 1),
-- Frente, 2 lugares: 05-08
(2, '05', 2, 'frente', 'Mesa frente 2 lugares - Deck', 1),
(2, '06', 2, 'frente', 'Mesa frente 2 lugares - Deck', 1),
(2, '07', 2, 'frente', 'Mesa frente 2 lugares - Deck', 1),
(2, '08', 2, 'frente', 'Mesa frente 2 lugares - Deck', 1),
-- 6 lugares: 09-12
(2, '09', 6, 'seis', 'Mesa 6 lugares - Deck', 1),
(2, '10', 6, 'seis', 'Mesa 6 lugares - Deck', 1),
(2, '11', 6, 'seis', 'Mesa 6 lugares - Deck', 1),
(2, '12', 6, 'seis', 'Mesa 6 lugares - Deck', 1),
-- Frente do bar, 3 lugares: 15-17
(2, '15', 3, 'frente_bar', 'Mesa frente do bar 3 lugares - Deck', 1),
(2, '16', 3, 'frente_bar', 'Mesa frente do bar 3 lugares - Deck', 1),
(2, '17', 3, 'frente_bar', 'Mesa frente do bar 3 lugares - Deck', 1);






