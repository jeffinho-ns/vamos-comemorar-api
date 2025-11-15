-- ========================================
-- SCRIPT DE TESTE: Criar Segunda Lista para Evento 27
-- ========================================
-- Use este script para testar a criação de novas listas
-- após a migração. Vai criar uma lista para outro promoter.
-- ========================================

-- Ver promoters disponíveis
SELECT 
  promoter_id, 
  nome, 
  email,
  codigo_identificador,
  status
FROM promoters 
WHERE ativo = TRUE
ORDER BY nome;

-- ========================================
-- Criar nova lista de teste
-- ========================================

-- Lista para Maria Santos (promoter_id = 2)
INSERT INTO listas (evento_id, promoter_responsavel_id, nome, tipo, observacoes)
VALUES (
  27,  -- Evento: Xeque Mate
  2,   -- Promoter: Maria Santos
  'Lista VIP - Maria Santos',
  'Promoter',
  'Lista criada como teste - VIPs com entrada preferencial'
);

-- Pegar o ID da lista criada
SET @lista_teste = LAST_INSERT_ID();

-- ========================================
-- Adicionar convidados de teste
-- ========================================

INSERT INTO listas_convidados (
  lista_id, 
  nome_convidado, 
  telefone_convidado, 
  email_convidado,
  status_checkin, 
  is_vip,
  observacoes
)
VALUES 
  (@lista_teste, 'Ana Clara Silva', '(11) 91111-2222', 'ana@email.com', 'Pendente', TRUE, 'VIP - Entrada gratuita'),
  (@lista_teste, 'Bruno Costa Santos', '(11) 93333-4444', 'bruno@email.com', 'Pendente', FALSE, NULL),
  (@lista_teste, 'Carla Lima Oliveira', '(11) 95555-6666', 'carla@email.com', 'Check-in', TRUE, 'VIP - Já confirmou presença'),
  (@lista_teste, 'Diego Ferreira', '(11) 97777-8888', 'diego@email.com', 'Pendente', FALSE, NULL),
  (@lista_teste, 'Elena Rodrigues', '(11) 99999-0000', 'elena@email.com', 'Pendente', TRUE, 'VIP - Mesa reservada');

-- ========================================
-- Verificar resultado
-- ========================================

-- Ver todas as listas do evento 27
SELECT 
  l.lista_id,
  l.nome as nome_lista,
  l.tipo,
  p.nome as promoter_nome,
  COUNT(lc.lista_convidado_id) as total_convidados,
  SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins,
  SUM(CASE WHEN lc.is_vip = TRUE THEN 1 ELSE 0 END) as total_vips
FROM listas l
JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE l.evento_id = 27
GROUP BY l.lista_id
ORDER BY l.created_at;

-- Ver convidados da nova lista
SELECT 
  lc.lista_convidado_id,
  lc.nome_convidado,
  lc.telefone_convidado,
  lc.email_convidado,
  lc.status_checkin,
  CASE WHEN lc.is_vip THEN 'VIP ⭐' ELSE 'Normal' END as tipo,
  lc.observacoes
FROM listas_convidados lc
WHERE lc.lista_id = @lista_teste
ORDER BY lc.is_vip DESC, lc.nome_convidado;

-- ========================================
-- Estatísticas gerais do evento 27
-- ========================================

SELECT 
  'Evento 27 - Xeque Mate' as evento,
  COUNT(DISTINCT l.lista_id) as total_listas,
  COUNT(DISTINCT lc.lista_convidado_id) as total_convidados,
  SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) as total_checkins,
  SUM(CASE WHEN lc.status_checkin = 'Pendente' THEN 1 ELSE 0 END) as total_pendentes,
  SUM(CASE WHEN lc.is_vip = TRUE THEN 1 ELSE 0 END) as total_vips,
  ROUND((SUM(CASE WHEN lc.status_checkin = 'Check-in' THEN 1 ELSE 0 END) / COUNT(lc.lista_convidado_id) * 100), 2) as taxa_checkin
FROM listas l
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE l.evento_id = 27;

-- ========================================
-- RESULTADO ESPERADO:
-- ========================================
-- Você deve ver 2 listas no evento 27:
-- 1. Lista de Jefferson Lima (2 convidados) - migrada
-- 2. Lista VIP - Maria Santos (5 convidados) - nova
--
-- Total: 7 convidados no evento
-- ========================================

-- ========================================
-- OPCIONAL: Deletar a lista de teste
-- (Descomente apenas se quiser remover)
-- ========================================

/*
DELETE FROM listas_convidados WHERE lista_id = @lista_teste;
DELETE FROM listas WHERE lista_id = @lista_teste;
SELECT 'Lista de teste removida com sucesso!' as status;
*/











