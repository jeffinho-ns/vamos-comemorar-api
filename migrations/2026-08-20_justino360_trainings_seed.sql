-- =====================================================
-- Justino360 — Seed de treinamentos de exemplo (Seu Justino)
-- Aditivo e idempotente: só insere o que ainda não existe pelo título.
-- Não altera schema e não toca em nenhum outro estabelecimento.
-- Rodar: psql "$DATABASE_URL" -f migrations/2026-08-20_justino360_trainings_seed.sql
-- =====================================================

BEGIN;

-- 1) Integração de garçom — trilha de entrada, recicla a cada 12 meses.
INSERT INTO j360_trainings
  (establishment_id, title, description, role_key, content_body, validity_days, is_mandatory)
SELECT
  1,
  'Integração do Garçom — Seu Justino',
  'Trilha de entrada para quem começa no salão: cultura da casa, fluxo de atendimento e uso do sistema.',
  'garcom',
  'Boas-vindas ao Seu Justino.' || chr(10) || chr(10) ||
  'Cultura da casa: quem chega aqui é recebido como visita em casa de amigo. Cumprimente pelo nome quando souber, olhe nos olhos e nunca deixe a mesa sem saber o próximo passo.' || chr(10) || chr(10) ||
  'Fluxo do atendimento: acolhida e água na mesa, apresentação do cardápio, sugestão de entrada e bebida, anotação do pedido no sistema, conferência antes de sair da cozinha, acompanhamento da mesa e fechamento sem pressa.' || chr(10) || chr(10) ||
  'Sistema: todo pedido entra pelo sistema, sempre. Pedido no papel ou de cabeça vira erro de conta e retrabalho na cozinha.' || chr(10) || chr(10) ||
  'Padrão de mesa: enxoval limpo, utensílios alinhados, sem louça suja acumulada. Mesa girando é mesa pronta em menos de dois minutos.' || chr(10) || chr(10) ||
  'Quando algo sai do padrão, registre a ocorrência no Justino360 com foto. Problema registrado é problema resolvido; problema falado no corredor volta amanhã.',
  365,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM j360_trainings
   WHERE establishment_id = 1 AND title = 'Integração do Garçom — Seu Justino'
);

-- 2) Atendimento — vale para todo o time de salão, bar e recepção.
INSERT INTO j360_trainings
  (establishment_id, title, description, role_key, content_body, validity_days, is_mandatory)
SELECT
  1,
  'Atendimento que encanta — padrão Seu Justino',
  'Como receber, conduzir e recuperar o cliente. Vale para salão, bar, recepção e caixa.',
  NULL,
  'Atendimento no Seu Justino é conversa, não formulário.' || chr(10) || chr(10) ||
  'Os primeiros trinta segundos definem a noite: contato visual, sorriso, boas-vindas pelo nome quando possível e leitura da mesa — casal em encontro, aniversário, mesa de trabalho, cada uma pede um ritmo diferente.' || chr(10) || chr(10) ||
  'Sugestão consultiva: pergunte o que a pessoa gosta antes de recomendar. Conheça os destaques do dia, os pratos que saem rápido e o que está em falta antes do serviço começar.' || chr(10) || chr(10) ||
  'Recuperação de falha: assuma, peça desculpa de verdade, resolva na hora e avise a gerência. Cliente que reclama e é bem atendido volta; cliente que reclama e é ignorado não volta e conta para os outros.' || chr(10) || chr(10) ||
  'O que nunca fazemos: discutir com cliente, prometer o que a cozinha não consegue entregar, deixar mesa sem retorno por mais de dez minutos e falar de assunto interno na área de salão.',
  365,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM j360_trainings
   WHERE establishment_id = 1 AND title = 'Atendimento que encanta — padrão Seu Justino'
);

-- 3) Segurança e emergência — reciclagem semestral por exigência operacional.
INSERT INTO j360_trainings
  (establishment_id, title, description, role_key, content_body, validity_days, is_mandatory)
SELECT
  1,
  'Segurança e emergência no salão',
  'Prevenção, condução de conflito, rotas de saída e acionamento de emergência. Reciclagem a cada 6 meses.',
  'seguranca',
  'Segurança no Seu Justino é prevenção, não reação.' || chr(10) || chr(10) ||
  'Prevenção: circule pelo salão, observe consumo excessivo, mochilas e bolsas em corredor, portas de emergência obstruídas e extintores fora do lugar. Corrigir antes é mais barato que resolver depois.' || chr(10) || chr(10) ||
  'Conflito: tom baixo, corpo aberto, nunca encoste no cliente. Isole a situação levando as pessoas para fora do olhar do salão e chame a gerência imediatamente.' || chr(10) || chr(10) ||
  'Emergência: saiba de cor as duas rotas de saída, onde ficam os extintores e o ponto de encontro. Em caso de incêndio, evacuação vem antes de qualquer tentativa de combate.' || chr(10) || chr(10) ||
  'Registro obrigatório: qualquer incidente com cliente, colaborador ou patrimônio entra como ocorrência no Justino360 no mesmo turno, com foto quando houver dano.',
  180,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM j360_trainings
   WHERE establishment_id = 1 AND title = 'Segurança e emergência no salão'
);

COMMIT;

-- Conferência rápida:
-- SELECT id, title, role_key, validity_days, is_mandatory, is_active
--   FROM j360_trainings WHERE establishment_id = 1 ORDER BY title;
