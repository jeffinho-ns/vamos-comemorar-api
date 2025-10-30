-- Migração: habilitar eventos para listas e corrigir id_place
-- Objetivo: Preencher eventos.id_place com base em places/bars e garantir HighLine correto
-- Seguro: Não remove dados, apenas atualiza campos NULL/inconsistentes

START TRANSACTION;

-- 1) Normalizar e vincular eventos a places por nome (casa_do_evento -> places.name)
UPDATE eventos e
LEFT JOIN places p
  ON REPLACE(LOWER(p.name), ' ', '') = REPLACE(LOWER(e.casa_do_evento), ' ', '')
SET e.id_place = p.id
WHERE e.id_place IS NULL;

-- 2) Para remanescentes, tentar vincular a bars (fallback)
UPDATE eventos e
LEFT JOIN bars b
  ON REPLACE(LOWER(b.name), ' ', '') = REPLACE(LOWER(e.casa_do_evento), ' ', '')
SET e.id_place = b.id
WHERE e.id_place IS NULL;

-- 3) Correção explícita para HighLine (places.id = 7)
UPDATE eventos
SET id_place = 7
WHERE (casa_do_evento LIKE 'High Line%' OR casa_do_evento LIKE 'HighLine%')
  AND (id_place IS NULL OR id_place <> 7);

-- 4) (Opcional) Habilitar uso de listas nos eventos do HighLine
-- Descomente se necessário
-- UPDATE eventos
-- SET usado_para_listas = 1
-- WHERE id_place = 7;

COMMIT;

-- =========================================================
-- Passo 2: Habilitar listas e criar 'Lista da Casa' quando ausente
-- =========================================================

START TRANSACTION;

-- 5) Habilitar uso de listas para eventos do HighLine
UPDATE eventos
SET usado_para_listas = 1
WHERE id_place = 7;

-- 6) Criar uma 'Lista da Casa' para eventos habilitados que ainda não possuem nenhuma lista
INSERT INTO listas (evento_id, promoter_responsavel_id, nome, tipo, observacoes)
SELECT e.id, NULL, 'Lista da Casa', 'Casa', 'Criada automaticamente'
FROM eventos e
WHERE e.usado_para_listas = 1
  AND NOT EXISTS (
    SELECT 1 FROM listas l WHERE l.evento_id = e.id
  );

COMMIT;

-- Script para habilitar eventos existentes para usar o sistema de listas
-- Execute este script se alguns eventos não estão aparecendo na página de listas

-- 1. Verificar eventos que não estão habilitados para listas
SELECT 
    id,
    nome_do_evento,
    data_do_evento,
    tipo_evento,
    usado_para_listas,
    id_place
FROM eventos 
WHERE usado_para_listas IS NULL OR usado_para_listas = FALSE
ORDER BY data_do_evento DESC;

-- 2. Habilitar TODOS os eventos para usar listas
UPDATE eventos 
SET usado_para_listas = TRUE 
WHERE usado_para_listas IS NULL OR usado_para_listas = FALSE;

-- 3. Verificar se a atualização funcionou
SELECT 
    COUNT(*) as total_eventos,
    SUM(CASE WHEN usado_para_listas = TRUE THEN 1 ELSE 0 END) as habilitados_para_listas,
    SUM(CASE WHEN usado_para_listas = FALSE THEN 1 ELSE 0 END) as desabilitados_para_listas
FROM eventos;

-- 4. Listar todos os eventos habilitados por estabelecimento
SELECT 
    e.id,
    e.nome_do_evento,
    e.data_do_evento,
    e.tipo_evento,
    e.usado_para_listas,
    COALESCE(p.name, b.name) as establishment_name,
    e.id_place
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
LEFT JOIN bars b ON e.id_place = b.id
WHERE e.usado_para_listas = TRUE
ORDER BY e.data_do_evento DESC, e.nome_do_evento ASC;

-- 5. Verificar se há listas criadas para os eventos
SELECT 
    e.id as evento_id,
    e.nome_do_evento,
    COUNT(l.lista_id) as total_listas,
    COUNT(lc.lista_convidado_id) as total_convidados
FROM eventos e
LEFT JOIN listas l ON e.id = l.evento_id
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE e.usado_para_listas = TRUE
GROUP BY e.id, e.nome_do_evento
ORDER BY total_listas DESC, e.nome_do_evento ASC;

