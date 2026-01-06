-- Script para excluir a lista de convidados da Laís Carretero
-- Execute este script no banco de dados

-- Primeiro, vamos encontrar a lista da Laís Carretero
-- O owner_name vem do client_name da reserva associada

-- Para PostgreSQL:
-- 1. Buscar o ID da lista de convidados da Laís Carretero
SELECT 
    gl.id as guest_list_id,
    gl.reservation_id,
    gl.reservation_type,
    COALESCE(lr.client_name, rr.client_name) as owner_name,
    COALESCE(lr.reservation_date, rr.reservation_date) as reservation_date
FROM guest_lists gl
LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
WHERE 
    LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%laís%carretero%' 
    OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais%carretero%'
    OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais carretero%';

-- 2. Após identificar o ID da lista (substitua X pelo ID encontrado), execute:
-- DELETE FROM guests WHERE guest_list_id = X;
-- DELETE FROM guest_lists WHERE id = X;

-- OU execute tudo de uma vez (CUIDADO: isso excluirá TODAS as listas que contenham "Laís Carretero" no nome):
-- DELETE FROM guests WHERE guest_list_id IN (
--     SELECT gl.id 
--     FROM guest_lists gl
--     LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
--     LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
--     WHERE 
--         LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%laís%carretero%' 
--         OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais%carretero%'
--         OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais carretero%'
-- );
-- 
-- DELETE FROM guest_lists WHERE id IN (
--     SELECT gl.id 
--     FROM guest_lists gl
--     LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
--     LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
--     WHERE 
--         LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%laís%carretero%' 
--         OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais%carretero%'
--         OR LOWER(COALESCE(lr.client_name, rr.client_name)) LIKE '%lais carretero%'
-- );

