-- Corrigir camarotes do High Line (id_place = 7): apenas Highline Lounge 30 a 35
-- Remove C30-C35 que pertencem a outros estabelecimentos e não devem aparecer no High Line
DELETE FROM camarotes
WHERE id_place = 7
  AND nome_camarote IN ('C30', 'C31', 'C32', 'C33', 'C34', 'C35');

-- Atualiza nomes dos camarotes 101-106 de Highline-C1..C6 para Highline Lounge 30..35
UPDATE camarotes SET
  nome_camarote = CASE id
    WHEN 101 THEN 'Highline Lounge 30'
    WHEN 102 THEN 'Highline Lounge 31'
    WHEN 103 THEN 'Highline Lounge 32'
    WHEN 104 THEN 'Highline Lounge 33'
    WHEN 105 THEN 'Highline Lounge 34'
    WHEN 106 THEN 'Highline Lounge 35'
  END,
  regras_especificas = 'Camarote Highline Lounge',
  descricao = CASE id
    WHEN 101 THEN 'Highline Lounge 30'
    WHEN 102 THEN 'Highline Lounge 31'
    WHEN 103 THEN 'Highline Lounge 32'
    WHEN 104 THEN 'Highline Lounge 33'
    WHEN 105 THEN 'Highline Lounge 34'
    WHEN 106 THEN 'Highline Lounge 35'
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE id_place = 7 AND id IN (101, 102, 103, 104, 105, 106);

-- Inserir camarotes Lounge 30-35 se não existirem (para novos ambientes)
INSERT INTO camarotes (id_place, nome_camarote, capacidade_maxima, status, regras_especificas, valor_base, descricao)
SELECT 7, v.nome, 10, 'disponivel', 'Camarote Highline Lounge', 500.00, v.nome
FROM (VALUES
  ('Highline Lounge 30'),
  ('Highline Lounge 31'),
  ('Highline Lounge 32'),
  ('Highline Lounge 33'),
  ('Highline Lounge 34'),
  ('Highline Lounge 35')
) AS v(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM camarotes c WHERE c.id_place = 7 AND c.nome_camarote = v.nome
);
