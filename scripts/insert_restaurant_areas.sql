-- Script para inserir áreas de exemplo do restaurante
-- Execute este script se não houver áreas cadastradas

-- Inserir áreas do restaurante (apenas se não existirem)
INSERT IGNORE INTO restaurant_areas (name, description, capacity_lunch, capacity_dinner, is_active) VALUES
('Área Coberta', 'Área interna com ar condicionado e ambiente climatizado', 50, 40, 1),
('Área Descoberta', 'Área externa com vista para o jardim e ambiente natural', 30, 25, 1),
('Área VIP', 'Área exclusiva com serviço diferenciado', 20, 15, 1),
('Balcão', 'Área do balcão para refeições rápidas', 15, 12, 1),
('Terraço', 'Área no terraço com vista panorâmica', 25, 20, 1);

-- Verificar se as áreas foram inseridas
SELECT 'Áreas do Restaurante' as tabela, COUNT(*) as total FROM restaurant_areas WHERE is_active = 1;
