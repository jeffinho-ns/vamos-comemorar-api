const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterFaqsForCustomerPrompt,
  isCustomerFacingFaqEntry,
  stripMetaInstructionsFromAnswer,
  shouldIncludeMetaRules,
} = require('../../services/agent/faqPromptFilter');
const { buildFaqKnowledgeBlock } = require('../../services/agent/faqPrefetchService');

const META_ANSWER = `META-REGRA HIGHLINE — fonte de verdade da IA.
O bloco "Treinamento da IA" é a ÚNICA fonte de verdade.
NÃO usar conhecimento prévio do modelo.`;

const REGRA_TOM = `REGRA HIGHLINE — tom da IA no WhatsApp.
Atue como uma concierge humana. PROIBIDO usar listas com bullets.`;

const DRESS_CODE = {
  topic: 'dress_code',
  answer: 'Dress code casual elegante. Não aceitamos chinelos ou regatas.',
};

const HORARIO = {
  topic: 'dias_horarios_funcionamento',
  answer: 'Funcionamos quinta a sábado, das 16h às 4h.',
};

const OPERATIONAL_AREAS = {
  topic: 'reserva_areas_operacional_highline',
  answer: `REGRA EXCLUSIVA HIGHLINE — áreas do Sistema de Reservas:
Subáreas: Área Deck - Frente | Área Deck - Esquerdo | Área Bar | Área Rooftop - Centro.

Tom: respostas curtas, humanizadas, como concierge no WhatsApp (sem textão).

Fluxo quando o cliente perguntar sobre áreas ou quiser mesa:
1) Confirme data e quantidade de pessoas.
2) consultar_areas_mesa_reserva (mesas do painel; CONFIRMADA bloqueia o dia).
3) criar_pre_reserva com area = label da subárea.

Não use este tópico para preços de camarote/VIP — use areas_mesas_camarotes_diferenca.`,
};

const INTERNAL_TOPIC = {
  topic: 'prioridade_treinamento_ia',
  answer: META_ANSWER,
};

test('filterFaqsForCustomerPrompt remove respostas META-REGRA e tópicos internos', () => {
  const originalEnv = process.env.FAQ_PROMPT_INCLUDE_META;
  delete process.env.FAQ_PROMPT_INCLUDE_META;

  try {
    const filtered = filterFaqsForCustomerPrompt([
      INTERNAL_TOPIC,
      { topic: 'tom_atendimento_humano', answer: REGRA_TOM },
      { topic: 'meta_only', answer: META_ANSWER },
      DRESS_CODE,
      HORARIO,
    ]);

    assert.equal(filtered.some((e) => e.topic === 'prioridade_treinamento_ia'), false);
    assert.equal(filtered.some((e) => e.topic === 'tom_atendimento_humano'), false);
    assert.equal(filtered.some((e) => e.topic === 'meta_only'), false);
    assert.ok(filtered.some((e) => e.topic === 'dress_code'));
    assert.ok(filtered.some((e) => e.topic === 'dias_horarios_funcionamento'));
  } finally {
    if (originalEnv === undefined) delete process.env.FAQ_PROMPT_INCLUDE_META;
    else process.env.FAQ_PROMPT_INCLUDE_META = originalEnv;
  }
});

test('filterFaqsForCustomerPrompt mantém dress_code e horário', () => {
  const originalEnv = process.env.FAQ_PROMPT_INCLUDE_META;
  delete process.env.FAQ_PROMPT_INCLUDE_META;

  try {
    const filtered = filterFaqsForCustomerPrompt([DRESS_CODE, HORARIO]);
    assert.equal(filtered.length, 2);
    assert.match(filtered.find((e) => e.topic === 'dress_code').answer, /casual elegante/i);
    assert.match(filtered.find((e) => e.topic === 'dias_horarios_funcionamento').answer, /16h/i);
  } finally {
    if (originalEnv === undefined) delete process.env.FAQ_PROMPT_INCLUDE_META;
    else process.env.FAQ_PROMPT_INCLUDE_META = originalEnv;
  }
});

test('filterFaqsForCustomerPrompt mantém tópico operacional com fatos e remove instruções meta', () => {
  const originalEnv = process.env.FAQ_PROMPT_INCLUDE_META;
  delete process.env.FAQ_PROMPT_INCLUDE_META;

  try {
    const filtered = filterFaqsForCustomerPrompt([OPERATIONAL_AREAS]);
    assert.equal(filtered.length, 1);
    assert.match(filtered[0].answer, /Área Deck - Frente/i);
    assert.doesNotMatch(filtered[0].answer, /consultar_areas_mesa_reserva/i);
    assert.doesNotMatch(filtered[0].answer, /REGRA EXCLUSIVA/i);
    assert.doesNotMatch(filtered[0].answer, /Fluxo quando/i);
  } finally {
    if (originalEnv === undefined) delete process.env.FAQ_PROMPT_INCLUDE_META;
    else process.env.FAQ_PROMPT_INCLUDE_META = originalEnv;
  }
});

test('FAQ_PROMPT_INCLUDE_META=true desativa filtragem', () => {
  const originalEnv = process.env.FAQ_PROMPT_INCLUDE_META;
  process.env.FAQ_PROMPT_INCLUDE_META = 'true';

  try {
    assert.equal(shouldIncludeMetaRules(), true);
    const filtered = filterFaqsForCustomerPrompt([INTERNAL_TOPIC, DRESS_CODE]);
    assert.equal(filtered.length, 2);
    assert.match(filtered[0].answer, /META-REGRA/i);
  } finally {
    if (originalEnv === undefined) delete process.env.FAQ_PROMPT_INCLUDE_META;
    else process.env.FAQ_PROMPT_INCLUDE_META = originalEnv;
  }
});

test('fallback mantém 1-2 entradas factuais quando só há meta-treinamento', () => {
  const originalEnv = process.env.FAQ_PROMPT_INCLUDE_META;
  delete process.env.FAQ_PROMPT_INCLUDE_META;

  try {
    const filtered = filterFaqsForCustomerPrompt([
      INTERNAL_TOPIC,
      { topic: 'tom_atendimento_humano', answer: REGRA_TOM },
      OPERATIONAL_AREAS,
    ]);

    assert.ok(filtered.length >= 1);
    assert.ok(filtered.length <= 2);
    assert.ok(filtered.some((e) => /Área Deck/i.test(e.answer)));
  } finally {
    if (originalEnv === undefined) delete process.env.FAQ_PROMPT_INCLUDE_META;
    else process.env.FAQ_PROMPT_INCLUDE_META = originalEnv;
  }
});

test('buildFaqKnowledgeBlock não inclui META-REGRA no bloco final', () => {
  const originalEnv = process.env.FAQ_PROMPT_INCLUDE_META;
  delete process.env.FAQ_PROMPT_INCLUDE_META;

  try {
    const block = buildFaqKnowledgeBlock([INTERNAL_TOPIC, DRESS_CODE, HORARIO], 'HighLine');
    assert.doesNotMatch(block, /META-REGRA/i);
    assert.doesNotMatch(block, /prioridade_treinamento_ia/i);
    assert.match(block, /dress_code/i);
    assert.match(block, /16h/i);
  } finally {
    if (originalEnv === undefined) delete process.env.FAQ_PROMPT_INCLUDE_META;
    else process.env.FAQ_PROMPT_INCLUDE_META = originalEnv;
  }
});

test('isCustomerFacingFaqEntry exclui operacionais no modo offline', () => {
  assert.equal(isCustomerFacingFaqEntry(OPERATIONAL_AREAS, { forOffline: true }), false);
  assert.equal(isCustomerFacingFaqEntry(DRESS_CODE, { forOffline: true }), true);
});

test('stripMetaInstructionsFromAnswer remove linhas NÃO diga ao cliente', () => {
  const stripped = stripMetaInstructionsFromAnswer(`REGRA EXCLUSIVA — grupos grandes:
NUNCA diga que a casa está cheia só porque uma mesa única não comporta todo o grupo.
Acima de 60 pessoas: handoff humano.`);

  assert.doesNotMatch(stripped, /NUNCA diga/i);
  assert.match(stripped, /60 pessoas/i);
});
