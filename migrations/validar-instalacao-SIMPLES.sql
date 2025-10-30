-- ========================================
-- VALIDAÇÃO SIMPLIFICADA
-- Verifica se tudo foi instalado corretamente
-- ========================================

SELECT '===== VALIDAÇÃO DA INSTALAÇÃO =====' AS '';

-- Teste 1: Contar promoters
SELECT '1️⃣ Promoters cadastrados:' AS '';
SELECT COUNT(*) as total FROM promoters;

-- Teste 2: Contar benefícios
SELECT '2️⃣ Benefícios cadastrados:' AS '';
SELECT COUNT(*) as total FROM beneficios;

-- Teste 3: Contar hostess
SELECT '3️⃣ Hostess cadastradas:' AS '';
SELECT COUNT(*) as total FROM hostess;

-- Teste 4: Verificar eventos habilitados
SELECT '4️⃣ Eventos habilitados:' AS '';
SELECT 
  COUNT(*) as total_eventos,
  SUM(CASE WHEN tipo_evento = 'unico' THEN 1 ELSE 0 END) as eventos_unicos,
  SUM(CASE WHEN tipo_evento = 'semanal' THEN 1 ELSE 0 END) as eventos_semanais
FROM eventos
WHERE usado_para_listas = TRUE;

-- Teste 5: Próximos eventos únicos
SELECT '5️⃣ Próximos eventos únicos:' AS '';
SELECT 
  id,
  nome_do_evento,
  data_do_evento,
  hora_do_evento
FROM eventos
WHERE tipo_evento = 'unico'
AND data_do_evento >= CURDATE()
AND usado_para_listas = TRUE
ORDER BY data_do_evento ASC
LIMIT 3;

-- Teste 6: Eventos semanais ativos
SELECT '6️⃣ Eventos semanais ativos:' AS '';
SELECT 
  id,
  nome_do_evento,
  CASE dia_da_semana
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END as dia_semana,
  hora_do_evento
FROM eventos
WHERE tipo_evento = 'semanal'
AND usado_para_listas = TRUE
ORDER BY dia_da_semana ASC
LIMIT 5;

-- Resultado final
SELECT '===== RESULTADO =====' AS '';

SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM promoters) >= 4 
     AND (SELECT COUNT(*) FROM beneficios) >= 6
     AND (SELECT COUNT(*) FROM hostess) >= 4
     AND (SELECT COUNT(*) FROM eventos WHERE usado_para_listas = TRUE) > 0
    THEN '✅ INSTALAÇÃO OK - Pronto para usar!'
    ELSE '⚠️ VERIFICAR - Algo pode estar faltando'
  END as status_final;







