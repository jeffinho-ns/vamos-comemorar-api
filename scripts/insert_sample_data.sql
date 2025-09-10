-- Script para inserir dados de exemplo no sistema de reservas do restaurante
-- Execute este script após criar as tabelas

-- Inserir áreas do restaurante
INSERT INTO restaurant_areas (name, description, capacity_lunch, capacity_dinner, is_active) VALUES
('Área Coberta', 'Área interna com ar condicionado e ambiente climatizado', 50, 40, 1),
('Área Descoberta', 'Área externa com vista para o jardim e ambiente natural', 30, 25, 1),
('Área VIP', 'Área exclusiva com serviço diferenciado', 20, 15, 1),
('Balcão', 'Área do balcão para refeições rápidas', 15, 12, 1),
('Terraço', 'Área no terraço com vista panorâmica', 25, 20, 1);

-- Inserir datas especiais
INSERT INTO special_dates (name, date, capacity_lunch, capacity_dinner, is_blocked, description) VALUES
('Ano Novo', '2024-01-01', 0, 0, 1, 'Restaurante fechado no Ano Novo'),
('Dia dos Namorados', '2024-06-12', 100, 80, 0, 'Menu especial para casais'),
('Natal', '2024-12-25', 0, 0, 1, 'Restaurante fechado no Natal'),
('Réveillon', '2024-12-31', 120, 100, 0, 'Ceia especial de Réveillon'),
('Dia das Mães', '2024-05-12', 80, 60, 0, 'Menu especial para o Dia das Mães');

-- Inserir algumas reservas de exemplo
INSERT INTO restaurant_reservations (client_name, client_phone, client_email, reservation_date, reservation_time, number_of_people, area_id, table_number, status, origin, notes, created_by) VALUES
('João Silva', '(11) 99999-9999', 'joao@email.com', CURDATE(), '19:30:00', 4, 1, 'Mesa 5', 'CONFIRMADA', 'PESSOAL', 'Aniversário de casamento', 1),
('Maria Santos', '(11) 88888-8888', 'maria@email.com', CURDATE(), '20:00:00', 2, 2, 'Mesa 12', 'NOVA', 'TELEFONE', 'Primeira visita', 1),
('Pedro Costa', '(11) 77777-7777', 'pedro@email.com', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '19:00:00', 6, 3, 'Mesa VIP 1', 'CONFIRMADA', 'SITE', 'Jantar de negócios', 1),
('Ana Oliveira', '(11) 66666-6666', 'ana@email.com', DATE_ADD(CURDATE(), INTERVAL 2 DAY), '18:30:00', 3, 1, 'Mesa 8', 'NOVA', 'WIDGET', 'Celebração de promoção', 1),
('Carlos Ferreira', '(11) 55555-5555', 'carlos@email.com', DATE_ADD(CURDATE(), INTERVAL 3 DAY), '20:30:00', 8, 2, 'Mesa 15', 'CONFIRMADA', 'PESSOAL', 'Festa de aniversário', 1);

-- Inserir alguns passantes de exemplo
INSERT INTO walk_ins (client_name, client_phone, number_of_people, area_id, table_number, status, notes, created_by) VALUES
('Roberto Lima', '(11) 44444-4444', 2, 4, 'Balcão 3', 'ATIVO', 'Cliente regular', 1),
('Fernanda Alves', '(11) 33333-3333', 4, 1, 'Mesa 3', 'ATIVO', 'Primeira vez no restaurante', 1),
('Lucas Mendes', '(11) 22222-2222', 1, 4, 'Balcão 1', 'FINALIZADO', 'Almoço rápido', 1);

-- Inserir alguns itens na lista de espera
INSERT INTO waitlist (client_name, client_phone, client_email, number_of_people, preferred_time, status, position, estimated_wait_time, notes) VALUES
('Patricia Souza', '(11) 11111-1111', 'patricia@email.com', 3, '19:00:00', 'AGUARDANDO', 1, 0, 'Preferência por mesa na janela'),
('Ricardo Gomes', '(11) 00000-0000', 'ricardo@email.com', 2, '20:00:00', 'AGUARDANDO', 2, 15, 'Cliente VIP'),
('Juliana Rocha', '(11) 99999-0000', 'juliana@email.com', 5, '19:30:00', 'CHAMADO', 3, 30, 'Celebração familiar');

-- Atualizar estatísticas (opcional - para demonstração)
-- As estatísticas são calculadas dinamicamente, mas podemos inserir alguns dados históricos

-- Inserir reservas de dias anteriores para demonstrar relatórios
INSERT INTO restaurant_reservations (client_name, client_phone, client_email, reservation_date, reservation_time, number_of_people, area_id, table_number, status, origin, notes, created_by) VALUES
('Cliente Histórico 1', '(11) 11111-1111', 'historico1@email.com', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '19:00:00', 4, 1, 'Mesa 1', 'CONCLUIDA', 'PESSOAL', 'Reserva histórica', 1),
('Cliente Histórico 2', '(11) 22222-2222', 'historico2@email.com', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '20:00:00', 2, 2, 'Mesa 10', 'CONCLUIDA', 'TELEFONE', 'Reserva histórica', 1),
('Cliente Histórico 3', '(11) 33333-3333', 'historico3@email.com', DATE_SUB(CURDATE(), INTERVAL 2 DAY), '19:30:00', 6, 3, 'Mesa VIP 2', 'CONCLUIDA', 'SITE', 'Reserva histórica', 1),
('Cliente Histórico 4', '(11) 44444-4444', 'historico4@email.com', DATE_SUB(CURDATE(), INTERVAL 3 DAY), '18:30:00', 3, 1, 'Mesa 6', 'CANCELADA', 'WIDGET', 'Reserva cancelada', 1),
('Cliente Histórico 5', '(11) 55555-5555', 'historico5@email.com', DATE_SUB(CURDATE(), INTERVAL 4 DAY), '20:30:00', 8, 2, 'Mesa 18', 'NO_SHOW', 'PESSOAL', 'Cliente não compareceu', 1);

-- Verificar se os dados foram inseridos corretamente
SELECT 'Áreas do Restaurante' as tabela, COUNT(*) as total FROM restaurant_areas
UNION ALL
SELECT 'Datas Especiais', COUNT(*) FROM special_dates
UNION ALL
SELECT 'Reservas', COUNT(*) FROM restaurant_reservations
UNION ALL
SELECT 'Passantes', COUNT(*) FROM walk_ins
UNION ALL
SELECT 'Lista de Espera', COUNT(*) FROM waitlist;



