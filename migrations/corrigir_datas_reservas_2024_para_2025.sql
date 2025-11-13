-- =====================================================
-- MIGRAÇÃO: Corrigir datas de reservas de 2024 para 2025
-- Data: 28 de Outubro de 2025
-- Autor: Sistema de Análise
-- =====================================================
-- DESCRIÇÃO:
-- Este script corrige o problema de reservas com datas
-- de 2024 (ano passado) para 2025 (ano atual).
-- =====================================================

-- =====================================================
-- BACKUP RECOMENDADO ANTES DE EXECUTAR
-- =====================================================
-- Faça um backup completo do banco antes de executar:
-- mysqldump -u username -p database_name > backup_antes_correcao_datas.sql
-- =====================================================

-- =====================================================
-- PASSO 1: Verificar quantas reservas serão afetadas
-- =====================================================

SELECT 
  'restaurant_reservations' as tabela,
  COUNT(*) as total_registros_2024
FROM restaurant_reservations
WHERE YEAR(reservation_date) = 2024;

SELECT 
  'large_reservations' as tabela,
  COUNT(*) as total_registros_2024
FROM large_reservations
WHERE YEAR(reservation_date) = 2024;

SELECT 
  'guest_lists' as tabela,
  COUNT(*) as total_registros_2024
FROM guest_lists
WHERE YEAR(expires_at) = 2024 OR expires_at = '0000-00-00 00:00:00';

-- =====================================================
-- PASSO 2: Atualizar reservas de restaurant_reservations
-- =====================================================

-- Adicionar 1 ano às datas de 2024
UPDATE restaurant_reservations 
SET 
  reservation_date = DATE_ADD(reservation_date, INTERVAL 1 YEAR),
  updated_at = CURRENT_TIMESTAMP
WHERE YEAR(reservation_date) = 2024;

-- Verificar resultado
SELECT 
  'Após UPDATE restaurant_reservations' as status,
  MIN(reservation_date) as data_mais_antiga,
  MAX(reservation_date) as data_mais_recente,
  COUNT(*) as total_registros
FROM restaurant_reservations;

-- =====================================================
-- PASSO 3: Atualizar reservas de large_reservations
-- =====================================================

-- Adicionar 1 ano às datas de 2024
UPDATE large_reservations 
SET 
  reservation_date = DATE_ADD(reservation_date, INTERVAL 1 YEAR),
  updated_at = CURRENT_TIMESTAMP
WHERE YEAR(reservation_date) = 2024;

-- Verificar resultado
SELECT 
  'Após UPDATE large_reservations' as status,
  MIN(reservation_date) as data_mais_antiga,
  MAX(reservation_date) as data_mais_recente,
  COUNT(*) as total_registros
FROM large_reservations;

-- =====================================================
-- PASSO 4: Atualizar datas de expiração das guest_lists
-- =====================================================

-- Adicionar 1 ano às datas de expiração de 2024
UPDATE guest_lists
SET 
  expires_at = DATE_ADD(expires_at, INTERVAL 1 YEAR),
  updated_at = CURRENT_TIMESTAMP
WHERE YEAR(expires_at) = 2024 AND expires_at != '0000-00-00 00:00:00';

-- Corrigir datas inválidas (0000-00-00) baseando-se na reservation
UPDATE guest_lists gl
LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
SET gl.expires_at = CONCAT(
  COALESCE(rr.reservation_date, lr.reservation_date) + INTERVAL 1 DAY, 
  ' 23:59:59'
)
WHERE gl.expires_at = '0000-00-00 00:00:00';

-- Verificar resultado
SELECT 
  'Após UPDATE guest_lists' as status,
  MIN(expires_at) as data_mais_antiga,
  MAX(expires_at) as data_mais_recente,
  COUNT(*) as total_registros
FROM guest_lists;

-- =====================================================
-- PASSO 5: Verificação final
-- =====================================================

-- Verificar se ainda existem reservas com data de 2024
SELECT 
  'Verificação Final' as status,
  (SELECT COUNT(*) FROM restaurant_reservations WHERE YEAR(reservation_date) = 2024) as rr_2024,
  (SELECT COUNT(*) FROM large_reservations WHERE YEAR(reservation_date) = 2024) as lr_2024,
  (SELECT COUNT(*) FROM guest_lists WHERE YEAR(expires_at) = 2024 AND expires_at != '0000-00-00 00:00:00') as gl_2024;

-- Mostrar exemplos de reservas atualizadas
SELECT 
  'restaurant_reservations' as tipo,
  id,
  client_name,
  reservation_date,
  establishment_id
FROM restaurant_reservations
WHERE YEAR(reservation_date) = 2025
ORDER BY reservation_date ASC
LIMIT 5;

SELECT 
  'large_reservations' as tipo,
  id,
  client_name,
  reservation_date,
  establishment_id
FROM large_reservations
WHERE YEAR(reservation_date) = 2025
ORDER BY reservation_date ASC
LIMIT 5;

-- =====================================================
-- PASSO 6: Verificar guest lists vinculadas
-- =====================================================

SELECT 
  gl.id as guest_list_id,
  gl.reservation_type,
  gl.event_type,
  COALESCE(rr.client_name, lr.client_name) as owner_name,
  COALESCE(rr.reservation_date, lr.reservation_date) as reservation_date,
  gl.expires_at,
  CASE 
    WHEN gl.expires_at >= NOW() THEN 'VÁLIDA'
    ELSE 'EXPIRADA'
  END as status
FROM guest_lists gl
LEFT JOIN restaurant_reservations rr ON gl.reservation_id = rr.id AND gl.reservation_type = 'restaurant'
LEFT JOIN large_reservations lr ON gl.reservation_id = lr.id AND gl.reservation_type = 'large'
WHERE YEAR(COALESCE(rr.reservation_date, lr.reservation_date)) = 2025
ORDER BY reservation_date ASC
LIMIT 10;

-- =====================================================
-- FIM DA MIGRAÇÃO
-- =====================================================

-- ✅ Se todos os passos foram executados com sucesso:
-- 1. As reservas agora estão em 2025
-- 2. As guest lists foram atualizadas
-- 3. O sistema deve mostrar as reservas no calendário
-- =====================================================

-- ⚠️ NOTA IMPORTANTE:
-- Após executar este script, limpe o cache do navegador
-- e recarregue a página de reservas no frontend.
-- =====================================================








