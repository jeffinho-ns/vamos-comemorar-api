-- ========================================
-- HABILITAR EVENTOS - VERSÃO SIMPLIFICADA
-- Sem acesso a INFORMATION_SCHEMA
-- ========================================

-- Habilitar TODOS os eventos existentes para o sistema de listas
UPDATE eventos
SET usado_para_listas = TRUE
WHERE usado_para_listas IS NULL OR usado_para_listas = FALSE;

-- Mostrar quantos eventos foram habilitados
SELECT COUNT(*) as total_eventos_habilitados
FROM eventos
WHERE usado_para_listas = TRUE;

-- Listar próximos eventos únicos habilitados
SELECT 
  id,
  nome_do_evento,
  data_do_evento,
  hora_do_evento,
  tipo_evento,
  casa_do_evento
FROM eventos
WHERE tipo_evento = 'unico'
AND data_do_evento >= CURDATE()
AND usado_para_listas = TRUE
ORDER BY data_do_evento ASC
LIMIT 5;

-- Listar eventos semanais habilitados
SELECT 
  id,
  nome_do_evento,
  dia_da_semana,
  CASE dia_da_semana
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END as dia_semana_texto,
  hora_do_evento,
  casa_do_evento
FROM eventos
WHERE tipo_evento = 'semanal'
AND usado_para_listas = TRUE
ORDER BY dia_da_semana ASC;

SELECT '✅ Eventos habilitados com sucesso!' AS status;



