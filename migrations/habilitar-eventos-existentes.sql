-- ========================================
-- SCRIPT AUXILIAR: Habilitar Eventos Existentes
-- Para facilitar os testes iniciais
-- ========================================

-- Verificar se o campo usado_para_listas existe
SELECT 
  COLUMN_NAME, 
  COLUMN_TYPE, 
  IS_NULLABLE, 
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'u621081794_vamos'
AND TABLE_NAME = 'eventos'
AND COLUMN_NAME IN ('usado_para_listas', 'promoter_criador_id');

-- Habilitar TODOS os eventos existentes para o sistema de listas
UPDATE eventos
SET usado_para_listas = TRUE
WHERE usado_para_listas IS NULL OR usado_para_listas = FALSE;

-- Verificar quantos eventos foram habilitados
SELECT 
  COUNT(*) as total_eventos,
  SUM(CASE WHEN usado_para_listas = TRUE THEN 1 ELSE 0 END) as eventos_habilitados,
  SUM(CASE WHEN tipo_evento = 'unico' THEN 1 ELSE 0 END) as eventos_unicos,
  SUM(CASE WHEN tipo_evento = 'semanal' THEN 1 ELSE 0 END) as eventos_semanais
FROM eventos;

-- Listar eventos habilitados agrupados por estabelecimento
SELECT 
  e.id_place as establishment_id,
  COALESCE(p.name, b.name, e.casa_do_evento) as establishment_name,
  COUNT(*) as total_eventos,
  SUM(CASE WHEN e.tipo_evento = 'unico' THEN 1 ELSE 0 END) as eventos_unicos,
  SUM(CASE WHEN e.tipo_evento = 'semanal' THEN 1 ELSE 0 END) as eventos_semanais
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
LEFT JOIN bars b ON e.id_place = b.id
WHERE e.usado_para_listas = TRUE
GROUP BY e.id_place, establishment_name
ORDER BY total_eventos DESC;

-- Listar próximos eventos únicos habilitados
SELECT 
  e.id,
  e.nome_do_evento,
  e.data_do_evento,
  e.hora_do_evento,
  e.tipo_evento,
  e.usado_para_listas,
  COALESCE(p.name, b.name, e.casa_do_evento) as establishment_name
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
LEFT JOIN bars b ON e.id_place = b.id
WHERE e.tipo_evento = 'unico'
AND e.data_do_evento >= CURDATE()
AND e.usado_para_listas = TRUE
ORDER BY e.data_do_evento ASC
LIMIT 10;

-- Listar eventos semanais habilitados
SELECT 
  e.id,
  e.nome_do_evento,
  e.dia_da_semana,
  CASE e.dia_da_semana
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END as dia_semana_texto,
  e.hora_do_evento,
  e.tipo_evento,
  e.usado_para_listas,
  COALESCE(p.name, b.name, e.casa_do_evento) as establishment_name
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
LEFT JOIN bars b ON e.id_place = b.id
WHERE e.tipo_evento = 'semanal'
AND e.usado_para_listas = TRUE
ORDER BY e.dia_da_semana ASC;

SELECT '✅ Script executado! Eventos habilitados para sistema de listas.' AS status;

