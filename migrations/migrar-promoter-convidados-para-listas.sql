-- ========================================
-- MIGRAÇÃO: promoter_convidados → listas + listas_convidados
-- Data: 2025-10-24
-- ========================================
-- Este script migra os convidados do sistema antigo para o novo sistema de listas
-- ========================================

-- PASSO 1: Criar listas para cada promoter+evento que tem convidados
-- ========================================

INSERT INTO listas (evento_id, promoter_responsavel_id, nome, tipo, observacoes)
SELECT DISTINCT
  pc.evento_id,
  pc.promoter_id,
  CONCAT('Lista de ', p.nome, ' - ', e.nome_do_evento) as nome,
  'Promoter' as tipo,
  'Lista migrada automaticamente do sistema antigo' as observacoes
FROM promoter_convidados pc
JOIN promoters p ON pc.promoter_id = p.promoter_id
JOIN eventos e ON pc.evento_id = e.id
WHERE pc.evento_id IS NOT NULL
  -- Apenas criar se NÃO existir uma lista para este promoter+evento
  AND NOT EXISTS (
    SELECT 1 
    FROM listas l 
    WHERE l.evento_id = pc.evento_id 
      AND l.promoter_responsavel_id = pc.promoter_id
  );

-- ========================================
-- PASSO 2: Migrar os convidados para as listas criadas
-- ========================================

INSERT INTO listas_convidados (
  lista_id, 
  nome_convidado, 
  telefone_convidado, 
  status_checkin, 
  data_checkin,
  observacoes,
  created_at,
  updated_at
)
SELECT
  l.lista_id,
  pc.nome as nome_convidado,
  pc.whatsapp as telefone_convidado,
  CASE 
    WHEN pc.status = 'compareceu' OR pc.checkin_realizado = 1 THEN 'Check-in'
    WHEN pc.status = 'cancelado' THEN 'No-Show'
    ELSE 'Pendente'
  END as status_checkin,
  pc.data_checkin,
  CONCAT(
    'Migrado do sistema antigo',
    CASE 
      WHEN pc.observacoes IS NOT NULL THEN CONCAT(' - ', pc.observacoes)
      ELSE ''
    END
  ) as observacoes,
  pc.created_at,
  pc.updated_at
FROM promoter_convidados pc
JOIN listas l ON l.evento_id = pc.evento_id 
  AND l.promoter_responsavel_id = pc.promoter_id
WHERE pc.evento_id IS NOT NULL
  -- Apenas migrar se ainda não foi migrado
  AND NOT EXISTS (
    SELECT 1 
    FROM listas_convidados lc
    WHERE lc.lista_id = l.lista_id 
      AND lc.nome_convidado = pc.nome
      AND lc.telefone_convidado = pc.whatsapp
  );

-- ========================================
-- PASSO 3: Verificar resultado
-- ========================================

-- Ver listas criadas
SELECT 
  l.lista_id,
  l.evento_id,
  e.nome_do_evento,
  l.nome as nome_lista,
  p.nome as promoter,
  COUNT(lc.lista_convidado_id) as total_convidados
FROM listas l
JOIN eventos e ON l.evento_id = e.id
JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE l.observacoes LIKE '%migrada automaticamente%'
GROUP BY l.lista_id
ORDER BY l.created_at DESC;

-- Ver convidados migrados
SELECT 
  lc.lista_convidado_id,
  lc.nome_convidado,
  lc.telefone_convidado,
  lc.status_checkin,
  l.nome as lista,
  e.nome_do_evento,
  p.nome as promoter
FROM listas_convidados lc
JOIN listas l ON lc.lista_id = l.lista_id
JOIN eventos e ON l.evento_id = e.id
JOIN promoters p ON l.promoter_responsavel_id = p.promoter_id
WHERE lc.observacoes LIKE '%Migrado do sistema antigo%'
ORDER BY lc.created_at DESC;

-- ========================================
-- VERIFICAÇÃO ESPECÍFICA: Evento 27
-- ========================================

SELECT 
  'ANTES DA MIGRAÇÃO - promoter_convidados' as fonte,
  COUNT(*) as total
FROM promoter_convidados
WHERE evento_id = 27
UNION ALL
SELECT 
  'DEPOIS DA MIGRAÇÃO - listas_convidados' as fonte,
  COUNT(*) as total
FROM listas_convidados lc
JOIN listas l ON lc.lista_id = l.lista_id
WHERE l.evento_id = 27;

-- ========================================
-- OPCIONAL: Marcar convidados antigos como migrados
-- (Descomente se quiser evitar duplicatas futuras)
-- ========================================

/*
UPDATE promoter_convidados
SET observacoes = CONCAT(
  COALESCE(observacoes, ''),
  ' [MIGRADO PARA SISTEMA DE LISTAS]'
)
WHERE evento_id IS NOT NULL
AND observacoes NOT LIKE '%MIGRADO PARA SISTEMA DE LISTAS%';
*/

-- ========================================
-- PRONTO! 🎉
-- ========================================
-- Após executar este script:
-- 1. As listas aparecerão em /admin/eventos/listas?evento_id=27
-- 2. Os convidados estarão vinculados às listas
-- 3. Você poderá fazer check-in normalmente
-- ========================================

