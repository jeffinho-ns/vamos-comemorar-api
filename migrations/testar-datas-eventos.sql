-- =====================================================================================================
-- Script de Teste: Verificar Formatação de Datas
-- Objetivo: Testar se DATE_FORMAT está retornando as datas corretamente
-- Data: 2025-10-24
-- =====================================================================================================

-- =====================================================================================================
-- TESTE 1: Verificar eventos recentes e suas datas
-- =====================================================================================================
SELECT '=== TESTE 1: Verificar formato de datas dos eventos ===' AS '';

SELECT 
  e.id,
  e.nome_do_evento,
  e.data_do_evento AS data_original_mysql,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') AS data_formatada_backend,
  DATE_FORMAT(e.data_do_evento, '%d/%m/%Y') AS data_formatada_br,
  e.tipo_evento,
  e.usado_para_listas
FROM eventos e
WHERE e.data_do_evento >= CURDATE()
ORDER BY e.data_do_evento ASC
LIMIT 10;

-- =====================================================================================================
-- TESTE 2: Verificar o evento ID 27 (Xeque Mate)
-- =====================================================================================================
SELECT '=== TESTE 2: Verificar evento específico (ID 27) ===' AS '';

SELECT 
  e.id,
  e.nome_do_evento,
  e.data_do_evento AS data_mysql,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') AS data_backend,
  DATE_FORMAT(e.data_do_evento, '%d/%m/%Y %H:%i') AS data_frontend,
  e.hora_do_evento,
  e.tipo_evento,
  p.name as estabelecimento
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
WHERE e.id = 27;

-- =====================================================================================================
-- TESTE 3: Verificar eventos criados para 31/10/2025
-- =====================================================================================================
SELECT '=== TESTE 3: Verificar eventos de 31/10/2025 ===' AS '';

SELECT 
  e.id,
  e.nome_do_evento,
  e.data_do_evento AS data_mysql,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') AS data_backend,
  DAYOFMONTH(e.data_do_evento) AS dia_do_mes,
  MONTH(e.data_do_evento) AS mes,
  YEAR(e.data_do_evento) AS ano,
  e.hora_do_evento,
  e.tipo_evento
FROM eventos e
WHERE e.data_do_evento = '2025-10-31'
OR DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') = '2025-10-31';

-- =====================================================================================================
-- TESTE 4: Verificar eventos de 24/10/2025
-- =====================================================================================================
SELECT '=== TESTE 4: Verificar eventos de 24/10/2025 ===' AS '';

SELECT 
  e.id,
  e.nome_do_evento,
  e.data_do_evento AS data_mysql,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') AS data_backend,
  DAYOFMONTH(e.data_do_evento) AS dia_do_mes,
  e.hora_do_evento,
  e.tipo_evento
FROM eventos e
WHERE e.data_do_evento = '2025-10-24'
OR DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') = '2025-10-24';

-- =====================================================================================================
-- TESTE 5: Simular query do Dashboard (getDashboard)
-- =====================================================================================================
SELECT '=== TESTE 5: Simular query getDashboard ===' AS '';

SELECT 
  e.id as evento_id,
  e.nome_do_evento as nome,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data_evento,
  e.hora_do_evento as horario_funcionamento,
  e.descricao,
  e.tipo_evento,
  p.name as establishment_name
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
WHERE e.tipo_evento = 'unico' 
AND e.data_do_evento >= CURDATE()
ORDER BY e.data_do_evento ASC
LIMIT 5;

-- =====================================================================================================
-- TESTE 6: Simular query do Promoter Público (/:codigo/eventos)
-- =====================================================================================================
SELECT '=== TESTE 6: Simular query Promoter Público ===' AS '';

SELECT 
  e.id,
  e.nome_do_evento as nome,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data,
  e.hora_do_evento as hora,
  pl.name as local_nome,
  pl.endereco as local_endereco
FROM eventos e
LEFT JOIN places pl ON e.id_place = pl.id
WHERE e.data_do_evento >= CURDATE()
AND e.status = 'ativo'
ORDER BY e.data_do_evento ASC, e.hora_do_evento ASC
LIMIT 5;

-- =====================================================================================================
-- TESTE 7: Verificar diferença entre DATE e DATE_FORMAT
-- =====================================================================================================
SELECT '=== TESTE 7: Comparar DATE vs DATE_FORMAT ===' AS '';

SELECT 
  e.id,
  e.nome_do_evento,
  e.data_do_evento AS sem_format,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') AS com_format,
  TYPEOF(e.data_do_evento) AS tipo_sem_format,
  'String' AS tipo_com_format,
  CASE 
    WHEN e.data_do_evento = DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') THEN 'Igual'
    ELSE 'Diferente'
  END AS comparacao
FROM eventos e
WHERE e.data_do_evento >= CURDATE()
LIMIT 5;

-- =====================================================================================================
-- TESTE 8: Verificar timezone do servidor MySQL
-- =====================================================================================================
SELECT '=== TESTE 8: Configurações de Timezone do MySQL ===' AS '';

SELECT 
  @@global.time_zone AS global_timezone,
  @@session.time_zone AS session_timezone,
  NOW() AS hora_atual_mysql,
  CURDATE() AS data_atual_mysql,
  CURTIME() AS hora_atual_mysql_2,
  UTC_TIMESTAMP() AS hora_utc;

-- =====================================================================================================
-- TESTE 9: Verificar eventos com listas
-- =====================================================================================================
SELECT '=== TESTE 9: Eventos com listas de convidados ===' AS '';

SELECT 
  e.id as evento_id,
  e.nome_do_evento,
  DATE_FORMAT(e.data_do_evento, '%Y-%m-%d') as data_evento,
  e.usado_para_listas,
  COUNT(DISTINCT l.lista_id) as total_listas,
  COUNT(DISTINCT lc.lista_convidado_id) as total_convidados
FROM eventos e
LEFT JOIN listas l ON e.id = l.evento_id
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE e.usado_para_listas = TRUE
AND e.data_do_evento >= CURDATE()
GROUP BY e.id
ORDER BY e.data_do_evento ASC
LIMIT 10;

-- =====================================================================================================
-- TESTE 10: Validação Final
-- =====================================================================================================
SELECT '=== TESTE 10: Validação Final - Eventos Futuros ===' AS '';

SELECT 
  CONCAT('Total de eventos futuros: ', COUNT(*)) AS resultado
FROM eventos 
WHERE data_do_evento >= CURDATE();

SELECT 
  CONCAT('Eventos com data_do_evento NULL: ', COUNT(*)) AS resultado
FROM eventos 
WHERE data_do_evento IS NULL;

SELECT 
  CONCAT('Eventos com usado_para_listas = TRUE: ', COUNT(*)) AS resultado
FROM eventos 
WHERE usado_para_listas = TRUE;

-- =====================================================================================================
-- RESULTADO ESPERADO
-- =====================================================================================================

/*
RESULTADO ESPERADO:

TESTE 1: Deve mostrar todos os eventos futuros com datas formatadas como '2025-10-24'

TESTE 2: Se evento 27 existe, deve mostrar:
  - data_mysql: 2025-10-24 (ou a data correta)
  - data_backend: 2025-10-24 (formato string)
  - data_frontend: 24/10/2025 17:00

TESTE 3: Deve mostrar eventos de 31/10/2025 se existirem
  - dia_do_mes: 31
  - mes: 10
  - ano: 2025

TESTE 4: Deve mostrar eventos de 24/10/2025 se existirem
  - dia_do_mes: 24

TESTE 5: Simula o que o Dashboard retorna
  - data_evento: deve ser string '2025-10-24'

TESTE 6: Simula o que a página do promoter retorna
  - data: deve ser string '2025-10-24'

TESTE 7: Mostra que DATE_FORMAT converte para string

TESTE 8: Mostra configurações de timezone do MySQL

TESTE 9: Eventos com listas e convidados

TESTE 10: Estatísticas gerais
*/

-- =====================================================================================================
-- FIM DOS TESTES
-- =====================================================================================================

SELECT '✅ Testes concluídos! Verifique os resultados acima.' AS '';






