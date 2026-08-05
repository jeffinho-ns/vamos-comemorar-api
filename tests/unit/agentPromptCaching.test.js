const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentPromptBuilder } = require('../../services/agent/AgentPromptBuilder');
const { buildOpenAiMessages } = require('../../services/agent/agentService');

const builder = new AgentPromptBuilder();

const baseSettings = {
  is_active: true,
  assistant_name: 'Luna',
  gender: 'feminino',
  tone: 'amigavel',
  response_size: 'media',
  use_emojis: true,
  use_bullets: false,
  use_greeting: true,
  greet_when_already_greeted: false,
  slang_intensity: 'leve',
  slang_text: 'show, fechado',
  custom_rules: ['Respeite fila VIP'],
  behavior_config: { nao_informar_reservas: true },
};

const stableContext = {
  assistantSettings: baseSettings,
  lockedEstablishmentId: 7,
  lockedEstablishmentName: 'HighLine',
};

test('pickStaticPromptContext ignora campos voláteis', () => {
  const picked = builder.pickStaticPromptContext({
    ...stableContext,
    referenceDate: '2026-08-05',
    waId: '5511999999999',
    faqKnowledgeBlock: 'FAQ volátil',
    contextSummary: 'memória volátil',
  });
  assert.deepEqual(picked, stableContext);
});

test('buildStatic idêntico com mesmas settings e memória/FAQ diferentes', () => {
  const staticA = builder.buildStatic(stableContext);
  const staticB = builder.buildStatic({
    ...stableContext,
    contextSummary: 'Cliente pediu mesa perto do palco',
    workingStateSummary: 'Funil: falta horário',
    faqKnowledgeBlock: 'TREINAMENTO DA IA — REGRAS DA CASA:\nHorário: 22h',
    referenceDate: '2026-08-05',
    waId: '5511999999999',
    reservationFunnelBlock: 'FUNIL ATIVO: falta horário',
    establishmentRulesBlock: 'Sábado: cover R$ 80',
    dateOverridesBlock: '2026-12-31: fechado',
    emotionalState: 'impaciente',
  });
  assert.equal(staticA, staticB);
  assert.ok(staticA.length > 200, 'prefixo estático deve ser substancial para cache');
  assert.doesNotMatch(staticA, /2026-08-05/);
  assert.doesNotMatch(staticA, /5511999999999/);
  assert.doesNotMatch(staticA, /FUNIL ATIVO/);
});

test('buildDynamic difere com memória/FAQ/referenceDate diferentes', () => {
  const dynamicA = builder.buildDynamic({
    ...stableContext,
    faqKnowledgeBlock: 'TREINAMENTO DA IA — REGRAS DA CASA:\nHorário: 22h',
    contextSummary: 'Resumo A',
    referenceDate: '2026-08-05',
  });
  const dynamicB = builder.buildDynamic({
    ...stableContext,
    faqKnowledgeBlock: 'TREINAMENTO DA IA — REGRAS DA CASA:\nHorário: 23h',
    contextSummary: 'Resumo B',
    referenceDate: '2026-08-06',
  });
  assert.notEqual(dynamicA, dynamicB);
  assert.match(dynamicA, /22h/);
  assert.match(dynamicB, /23h/);
  assert.match(dynamicA, /2026-08-05/);
  assert.match(dynamicB, /2026-08-06/);
});

test('buildOpenAiMessages mantém system estático antes do dinâmico e do histórico', () => {
  const messages = buildOpenAiMessages(
    [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá!' },
    ],
    'STATIC_PREFIX',
    'DYNAMIC_SUFFIX'
  );
  assert.equal(messages.length, 4);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[0].content, 'STATIC_PREFIX');
  assert.equal(messages[1].role, 'system');
  assert.equal(messages[1].content, 'DYNAMIC_SUFFIX');
  assert.equal(messages[2].role, 'user');
  assert.equal(messages[3].role, 'assistant');
});

test('buildOpenAiMessages omite system dinâmico vazio', () => {
  const messages = buildOpenAiMessages([{ role: 'user', content: 'Oi' }], 'STATIC_ONLY', '');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, 'STATIC_ONLY');
  assert.equal(messages[1].role, 'user');
});
