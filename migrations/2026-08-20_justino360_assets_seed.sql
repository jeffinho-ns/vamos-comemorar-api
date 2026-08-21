-- Justino360 — Fase 5 (manutenção e ativos)
-- Idempotente: pode rodar várias vezes sem duplicar nem sobrescrever dado de produção.
-- Escopo: Seu Justino (establishment_id = 1).

BEGIN;

-- 1) Laudo do serviço executado. O `description` continua sendo o problema relatado;
--    `resolution` guarda o que foi feito na conclusão do chamado.
ALTER TABLE j360_asset_maintenance
  ADD COLUMN IF NOT EXISTS resolution TEXT;

-- 2) Equipamentos típicos da casa — só entram se o inventário de ativos estiver vazio,
--    para nunca competir com o que a gerência já cadastrou na mão.
DO $$
DECLARE
  sec_cozinha INTEGER;
  sec_bar INTEGER;
  sec_salao INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM j360_assets WHERE establishment_id = 1) THEN
    RAISE NOTICE 'j360_assets já possui registros para o Seu Justino — seed ignorado.';
    RETURN;
  END IF;

  SELECT id INTO sec_cozinha FROM j360_sectors WHERE establishment_id = 1 AND key = 'cozinha';
  SELECT id INTO sec_bar FROM j360_sectors WHERE establishment_id = 1 AND key = 'bar';
  SELECT id INTO sec_salao FROM j360_sectors WHERE establishment_id = 1 AND key = 'salao';

  INSERT INTO j360_assets
    (establishment_id, sector_id, name, code, location, manufacturer, notes)
  VALUES
    (1, sec_cozinha, 'Câmara fria', 'CF-01', 'Cozinha — fundo',
     NULL, 'Registrar temperatura na abertura e no fechamento.'),
    (1, sec_cozinha, 'Freezer horizontal', 'FZ-01', 'Cozinha — estoque',
     NULL, 'Degelo programado quinzenal.'),
    (1, sec_cozinha, 'Fritadeira elétrica', 'FR-01', 'Cozinha — praça quente',
     NULL, 'Troca de óleo conforme POP da cozinha.'),
    (1, sec_bar, 'Chopeira', 'CH-01', 'Bar — balcão principal',
     NULL, 'Higienização de linha semanal.'),
    (1, sec_bar, 'Máquina de gelo', 'MG-01', 'Bar — apoio',
     NULL, 'Limpeza do filtro mensal.'),
    (1, sec_salao, 'Ar-condicionado do salão', 'AC-01', 'Salão',
     NULL, 'Limpeza de filtro mensal e higienização semestral.');

  RAISE NOTICE 'Seed de ativos do Justino360 aplicado (6 equipamentos).';
END $$;

COMMIT;
