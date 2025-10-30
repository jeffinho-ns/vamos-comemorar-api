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

