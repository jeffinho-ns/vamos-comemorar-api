-- ============================================================
-- MIGRAÇÃO: Corrigir id_place dos eventos e habilitar listas
-- ============================================================
-- INSTRUÇÕES DE EXECUÇÃO:
--
-- OPÇÃO 1: Via linha de comando MySQL/MariaDB:
--   mysql -u seu_usuario -p nome_do_banco < migrations/habilitar-eventos-para-listas.sql
--
-- OPÇÃO 2: Via phpMyAdmin ou cliente MySQL:
--   1. Abra o phpMyAdmin ou seu cliente MySQL favorito
--   2. Selecione o banco de dados (u621081794_vamos)
--   3. Vá na aba "SQL"
--   4. Cole todo o conteúdo deste arquivo
--   5. Clique em "Executar"
--
-- OPÇÃO 3: Via Node.js (script automatizado):
--   node scripts/run-migration-id-place.js
--
-- ============================================================

USE u621081794_vamos;

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

COMMIT;

-- =========================================================
-- Passo 2: Habilitar listas e criar 'Lista da Casa'
-- =========================================================

START TRANSACTION;

-- 4) Habilitar uso de listas para eventos do HighLine
UPDATE eventos
SET usado_para_listas = 1
WHERE id_place = 7;

-- 5) Criar uma 'Lista da Casa' para eventos habilitados que ainda não possuem nenhuma lista
INSERT INTO listas (evento_id, promoter_responsavel_id, nome, tipo, observacoes)
SELECT e.id, NULL, 'Lista da Casa', 'Casa', 'Criada automaticamente'
FROM eventos e
WHERE e.usado_para_listas = 1
  AND NOT EXISTS (
    SELECT 1 FROM listas l WHERE l.evento_id = e.id
  );

COMMIT;

-- =========================================================
-- VERIFICAÇÃO: Ver se funcionou
-- =========================================================

-- Verificar eventos do HighLine
SELECT 
    e.id,
    e.nome_do_evento,
    e.casa_do_evento,
    e.id_place,
    COALESCE(p.name, b.name) as establishment_name,
    e.usado_para_listas
FROM eventos e
LEFT JOIN places p ON e.id_place = p.id
LEFT JOIN bars b ON e.id_place = b.id
WHERE e.casa_do_evento LIKE '%High%' OR e.id_place = 7
ORDER BY e.id;

-- Verificar listas criadas
SELECT 
    l.lista_id,
    l.evento_id,
    e.nome_do_evento,
    l.nome,
    l.tipo,
    COUNT(lc.lista_convidado_id) as total_convidados
FROM listas l
JOIN eventos e ON l.evento_id = e.id
LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
WHERE e.id_place = 7
GROUP BY l.lista_id
ORDER BY l.evento_id;

