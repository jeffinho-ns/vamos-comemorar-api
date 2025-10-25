-- ========================================
-- TESTE RÁPIDO - Verificação Completa
-- Execute este script para verificar se tudo está OK
-- ========================================

SELECT '===== INICIANDO TESTES =====' AS '';

-- ========================================
-- TESTE 1: Verificar se tabelas existem
-- ========================================
SELECT '1️⃣ Verificando tabelas...' AS '';

SELECT 
  TABLE_NAME,
  CASE 
    WHEN TABLE_NAME IN ('promoters', 'listas', 'listas_convidados', 'beneficios', 'lista_convidado_beneficio', 'hostess')
    THEN '✅ OK'
    ELSE '❌ FALTA'
  END as status
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'u621081794_vamos'
AND TABLE_NAME IN ('promoters', 'listas', 'listas_convidados', 'beneficios', 'lista_convidado_beneficio', 'hostess')
ORDER BY TABLE_NAME;

-- ========================================
-- TESTE 2: Verificar campo usado_para_listas
-- ========================================
SELECT '2️⃣ Verificando campo usado_para_listas...' AS '';

SELECT 
  COLUMN_NAME,
  COLUMN_TYPE,
  CASE 
    WHEN COLUMN_NAME = 'usado_para_listas' THEN '✅ OK'
    ELSE '❌ NÃO ENCONTRADO'
  END as status
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'u621081794_vamos'
AND TABLE_NAME = 'eventos'
AND COLUMN_NAME IN ('usado_para_listas', 'promoter_criador_id');

-- ========================================
-- TESTE 3: Contar eventos habilitados
-- ========================================
SELECT '3️⃣ Contando eventos habilitados...' AS '';

SELECT 
  'EVENTOS HABILITADOS' as tipo,
  COUNT(*) as total,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ OK'
    ELSE '⚠️ NENHUM EVENTO HABILITADO'
  END as status
FROM eventos
WHERE usado_para_listas = TRUE

UNION ALL

SELECT 
  'EVENTOS ÚNICOS HABILITADOS' as tipo,
  COUNT(*) as total,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ OK'
    ELSE '⚠️ NENHUM'
  END as status
FROM eventos
WHERE usado_para_listas = TRUE AND tipo_evento = 'unico'

UNION ALL

SELECT 
  'EVENTOS SEMANAIS HABILITADOS' as tipo,
  COUNT(*) as total,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ OK'
    ELSE '⚠️ NENHUM'
  END as status
FROM eventos
WHERE usado_para_listas = TRUE AND tipo_evento = 'semanal';

-- ========================================
-- TESTE 4: Verificar dados de exemplo
-- ========================================
SELECT '4️⃣ Verificando dados de exemplo...' AS '';

SELECT 'PROMOTERS' as tabela, COUNT(*) as total,
  CASE WHEN COUNT(*) >= 4 THEN '✅ OK' ELSE '⚠️ Poucos registros' END as status
FROM promoters

UNION ALL

SELECT 'BENEFÍCIOS' as tabela, COUNT(*) as total,
  CASE WHEN COUNT(*) >= 6 THEN '✅ OK' ELSE '⚠️ Poucos registros' END as status
FROM beneficios

UNION ALL

SELECT 'HOSTESS' as tabela, COUNT(*) as total,
  CASE WHEN COUNT(*) >= 4 THEN '✅ OK' ELSE '⚠️ Poucos registros' END as status
FROM hostess;

-- ========================================
-- TESTE 5: Listar próximos eventos únicos
-- ========================================
SELECT '5️⃣ Próximos eventos únicos habilitados:' AS '';

SELECT 
  e.id,
  e.nome_do_evento,
  e.data_do_evento,
  e.hora_do_evento,
  e.casa_do_evento,
  CASE 
    WHEN e.usado_para_listas = TRUE THEN '✅ Habilitado'
    ELSE '❌ Desabilitado'
  END as status_listas
FROM eventos e
WHERE e.tipo_evento = 'unico'
AND e.data_do_evento >= CURDATE()
ORDER BY e.data_do_evento ASC
LIMIT 5;

-- ========================================
-- TESTE 6: Listar eventos semanais
-- ========================================
SELECT '6️⃣ Eventos semanais habilitados:' AS '';

SELECT 
  e.id,
  e.nome_do_evento,
  CASE e.dia_da_semana
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END as dia_semana,
  e.hora_do_evento,
  e.casa_do_evento,
  CASE 
    WHEN e.usado_para_listas = TRUE THEN '✅ Habilitado'
    ELSE '❌ Desabilitado'
  END as status_listas
FROM eventos e
WHERE e.tipo_evento = 'semanal'
ORDER BY e.dia_da_semana ASC
LIMIT 10;

-- ========================================
-- TESTE 7: Eventos por estabelecimento
-- ========================================
SELECT '7️⃣ Eventos habilitados por estabelecimento:' AS '';

SELECT 
  e.id_place as estabelecimento_id,
  COALESCE(p.name, b.name, e.casa_do_evento) as estabelecimento,
  COUNT(*) as total_eventos,
  SUM(CASE WHEN e.tipo_evento = 'unico' THEN 1 ELSE 0 END) as eventos_unicos,
  SUM(CASE WHEN e.tipo_evento = 'semanal' THEN 1 ELSE 0 END) as eventos_semanais
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
LEFT JOIN bars b ON e.id_place = b.id
WHERE e.usado_para_listas = TRUE
GROUP BY e.id_place, estabelecimento
ORDER BY total_eventos DESC;

-- ========================================
-- TESTE 8: Verificar Foreign Keys
-- ========================================
SELECT '8️⃣ Verificando Foreign Keys...' AS '';

SELECT 
  TABLE_NAME as tabela,
  CONSTRAINT_NAME as constraint_nome,
  REFERENCED_TABLE_NAME as tabela_referenciada,
  '✅ OK' as status
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'u621081794_vamos'
AND TABLE_NAME IN ('listas', 'listas_convidados', 'lista_convidado_beneficio')
AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME;

-- ========================================
-- RESULTADO FINAL
-- ========================================
SELECT '===== RESUMO DOS TESTES =====' AS '';

SELECT 
  'Tabelas Criadas' as item,
  COUNT(DISTINCT TABLE_NAME) as quantidade,
  CASE 
    WHEN COUNT(DISTINCT TABLE_NAME) >= 6 THEN '✅ SUCESSO'
    ELSE '❌ INCOMPLETO'
  END as resultado
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'u621081794_vamos'
AND TABLE_NAME IN ('promoters', 'listas', 'listas_convidados', 'beneficios', 'lista_convidado_beneficio', 'hostess')

UNION ALL

SELECT 
  'Eventos Habilitados' as item,
  COUNT(*) as quantidade,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ SUCESSO'
    ELSE '⚠️ NENHUM EVENTO - Habilite em /admin/eventos/configurar'
  END as resultado
FROM eventos
WHERE usado_para_listas = TRUE

UNION ALL

SELECT 
  'Promoters Cadastrados' as item,
  COUNT(*) as quantidade,
  CASE 
    WHEN COUNT(*) >= 4 THEN '✅ SUCESSO'
    ELSE '⚠️ Poucos registros'
  END as resultado
FROM promoters

UNION ALL

SELECT 
  'Benefícios Cadastrados' as item,
  COUNT(*) as quantidade,
  CASE 
    WHEN COUNT(*) >= 6 THEN '✅ SUCESSO'
    ELSE '⚠️ Poucos registros'
  END as resultado
FROM beneficios;

SELECT '' AS '';
SELECT '📌 PRÓXIMOS PASSOS:' AS '';
SELECT '1. Se todos os testes passaram: Deploy backend e frontend' AS '';
SELECT '2. Se "Eventos Habilitados" = 0: Execute habilitar-eventos-existentes.sql' AS '';
SELECT '3. Acesse /admin/eventos/dashboard no frontend' AS '';
SELECT '' AS '';
SELECT '✅ FIM DOS TESTES' AS '';






