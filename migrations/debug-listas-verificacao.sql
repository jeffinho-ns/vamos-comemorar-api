-- ========================================
-- SCRIPT DE VERIFICAÇÃO DE LISTAS
-- Use este script para debug quando as listas não aparecem
-- ========================================

-- 1. Ver todos os eventos disponíveis
SELECT 
  id as evento_id,
  nome_do_evento,
  data_do_evento,
  tipo_evento,
  usado_para_listas
FROM eventos
ORDER BY data_do_evento DESC
LIMIT 10;

-- 2. Ver todas as listas existentes
SELECT 
  l.lista_id,
  l.evento_id,
  l.nome as nome_lista,
  l.tipo,
  l.promoter_responsavel_id,
  p.nome as promoter_nome,
  e.nome_do_evento,
  e.data_do_evento,
  l.created_at
FROM listas l
LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
LEFT JOIN eventos e ON l.evento_id = e.id
ORDER BY l.created_at DESC;

-- 3. Ver convidados de todas as listas
SELECT 
  lc.lista_convidado_id,
  lc.lista_id,
  l.nome as nome_lista,
  lc.nome_convidado,
  lc.status_checkin,
  lc.telefone_convidado,
  lc.email_convidado,
  lc.is_vip,
  e.nome_do_evento
FROM listas_convidados lc
JOIN listas l ON lc.lista_id = l.lista_id
JOIN eventos e ON l.evento_id = e.id
ORDER BY lc.created_at DESC
LIMIT 20;

-- 4. Ver estatísticas de listas por evento
SELECT 
  e.id as evento_id,
  e.nome_do_evento,
  e.data_do_evento,
  COUNT(DISTINCT l.lista_id) as total_listas,
  COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
  SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins
FROM eventos e
LEFT JOIN listas l ON e.id = l.evento_id
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE e.usado_para_listas = TRUE
GROUP BY e.id
ORDER BY e.data_do_evento DESC;

-- 5. Ver promoters ativos
SELECT 
  promoter_id,
  nome,
  email,
  telefone,
  codigo_identificador,
  status,
  ativo
FROM promoters
WHERE ativo = TRUE
ORDER BY nome;

-- 6. Ver relação promoter-evento
SELECT 
  pe.id,
  pe.promoter_id,
  p.nome as promoter_nome,
  pe.evento_id,
  e.nome_do_evento,
  pe.data_evento,
  pe.status,
  pe.funcao
FROM promoter_eventos pe
JOIN promoters p ON pe.promoter_id = p.promoter_id
JOIN eventos e ON pe.evento_id = e.id
WHERE pe.status = 'ativo'
ORDER BY pe.data_evento DESC;

-- 7. QUERY ESPECÍFICA: Ver listas de um evento específico (SUBSTITUA o ID)
-- Troque "1" pelo ID do evento que você está testando
SELECT 
  l.*,
  p.nome as promoter_nome,
  p.email as promoter_email,
  p.telefone as promoter_telefone,
  COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
  SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins,
  SUM(CASE WHEN lc.status_checkin = 'Pendente' THEN 1 ELSE 0 END) as total_pendentes,
  SUM(CASE WHEN lc.status_checkin = 'No-Show' THEN 1 ELSE 0 END) as total_noshow
FROM listas l
LEFT JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE l.evento_id = 1  -- <<<< TROQUE ESTE NÚMERO PELO ID DO SEU EVENTO
GROUP BY l.lista_id
ORDER BY l.tipo, l.nome;

-- ========================================
-- SOLUÇÃO RÁPIDA: Criar lista de teste
-- ========================================

-- Se não houver listas, você pode criar uma de teste:
-- (Descomente as linhas abaixo e ajuste os IDs)

/*
-- Primeiro, pegue um evento_id e um promoter_id válidos das queries acima

INSERT INTO listas (evento_id, promoter_responsavel_id, nome, tipo, observacoes)
VALUES (
  1,  -- <<< SUBSTITUA pelo evento_id que você quer testar
  1,  -- <<< SUBSTITUA pelo promoter_id do promoter
  'Lista de Teste - Admin',
  'Promoter',
  'Lista criada para teste via SQL'
);

-- Depois, adicione alguns convidados de teste:
SET @lista_id = LAST_INSERT_ID();

INSERT INTO listas_convidados (lista_id, nome_convidado, telefone_convidado, status_checkin, is_vip)
VALUES 
  (@lista_id, 'João Silva', '(11) 98765-4321', 'Pendente', FALSE),
  (@lista_id, 'Maria Santos', '(11) 91234-5678', 'Pendente', TRUE),
  (@lista_id, 'Pedro Oliveira', '(11) 99876-5432', 'Check-in', FALSE);

-- Verifique:
SELECT * FROM listas WHERE lista_id = @lista_id;
SELECT * FROM listas_convidados WHERE lista_id = @lista_id;
*/

