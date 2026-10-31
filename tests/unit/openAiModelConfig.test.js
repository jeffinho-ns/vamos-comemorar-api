const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeOpenAiModelName,
  MODEL_AGENT,
  MODEL_FALLBACK,
  MODEL_ECONOMY,
  getModelForTask,
  applyOutputLimit,
  isStaffShift,
  resolveAgentModels,
} = require('../../services/agent/openAiConfig');
const {
  classifyAgentRuntimeError,
  shouldImmediateHumanHandoffOnAgentError,
} = require('../../services/conversationEngine/agentErrorPolicy');

test('sanitizeOpenAiModelName corrige typo pt-5.4 para gpt-5.4', () => {
  assert.equal(sanitizeOpenAiModelName('pt-5.4', 'gpt-4o'), 'gpt-5.4');
});

test('sanitizeOpenAiModelName rejeita nome inválido e usa default', () => {
  assert.equal(sanitizeOpenAiModelName('foo-bar', 'gpt-4o'), 'gpt-4o');
});

test('getModelForTask usa modelo econômico para faq e summary', () => {
  assert.equal(getModelForTask('faq'), MODEL_ECONOMY);
  assert.equal(getModelForTask('summary'), MODEL_ECONOMY);
  assert.equal(getModelForTask('history_summary'), MODEL_ECONOMY);
});

test('getModelForTask usa MODEL_AGENT para agente e tarefas desconhecidas', () => {
  assert.equal(getModelForTask('agent'), MODEL_AGENT);
  assert.equal(getModelForTask('confirmation'), MODEL_AGENT);
  assert.equal(getModelForTask(''), MODEL_AGENT);
  assert.equal(getModelForTask(undefined), MODEL_AGENT);
});

test('primary é Sol de dia e de noite; Terra só entra como fallback', () => {
  assert.equal(isStaffShift(new Date('2026-10-29T16:30:00-03:00')), true);
  assert.equal(isStaffShift(new Date('2026-10-29T17:00:00-03:00')), false);
  assert.equal(isStaffShift(new Date('2026-10-29T07:59:00-03:00')), false);
  assert.equal(isStaffShift(new Date('2026-10-31T12:00:00-03:00')), false);

  const previous = process.env.OPENAI_AGENT_SCHEDULE;
  delete process.env.OPENAI_AGENT_SCHEDULE;
  try {
    const expediente = resolveAgentModels(new Date('2026-10-29T10:00:00-03:00'));
    assert.equal(expediente.primary, 'gpt-6.1-sol');
    assert.equal(expediente.fallback, 'gpt-6.1-terra');
    assert.equal(expediente.shift, 'expediente');

    const noite = resolveAgentModels(new Date('2026-10-29T21:00:00-03:00'));
    assert.equal(noite.primary, 'gpt-6.1-sol');
    assert.equal(noite.fallback, 'gpt-6.1-terra');
    assert.equal(noite.shift, 'fora');

    const sabado = resolveAgentModels(new Date('2026-10-31T15:00:00-03:00'));
    assert.equal(sabado.primary, 'gpt-6.1-sol');
    assert.equal(sabado.fallback, 'gpt-6.1-terra');
    assert.equal(sabado.shift, 'fora');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_AGENT_SCHEDULE;
    else process.env.OPENAI_AGENT_SCHEDULE = previous;
  }
});

test('OPENAI_AGENT_SCHEDULE=off mantém o par fixo das variáveis de ambiente', () => {
  const previous = process.env.OPENAI_AGENT_SCHEDULE;
  process.env.OPENAI_AGENT_SCHEDULE = 'off';
  try {
    const resolved = resolveAgentModels(new Date('2026-10-29T10:00:00-03:00'));
    assert.equal(resolved.primary, MODEL_AGENT);
    assert.equal(resolved.fallback, MODEL_FALLBACK);
    assert.equal(resolved.shift, 'fixo');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_AGENT_SCHEDULE;
    else process.env.OPENAI_AGENT_SCHEDULE = previous;
  }
});

test('applyOutputLimit define limite finito de conclusão por modo', () => {
  const conversational = applyOutputLimit({ model: 'gpt-5.5' }, 'conversational');
  assert.equal(conversational.max_completion_tokens, 400);
  assert.equal(conversational.max_tokens, undefined);

  const json = applyOutputLimit({ model: 'gpt-4o-mini' }, 'json');
  assert.equal(json.max_tokens, 220);
  assert.equal(json.max_completion_tokens, undefined);

  const withTools = applyOutputLimit(
    { model: 'gpt-5.5', tools: [{ type: 'function', function: { name: 'x' } }] },
    'conversational'
  );
  assert.equal(withTools.max_completion_tokens, 500);

  const agentMode = applyOutputLimit({ model: 'gpt-5.5' }, 'agent');
  assert.equal(agentMode.max_completion_tokens, 500);
});

test('INSUFFICIENT_QUOTA dispara handoff automático para humano', () => {
  const previous = process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
  delete process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;

  try {
    const error = new Error(
      'Falha na OpenAI: You exceeded your current quota (status=429 code=INSUFFICIENT_QUOTA model=gpt-5.5)'
    );
    error.code = 'INSUFFICIENT_QUOTA';
    error.status = 429;

    assert.equal(classifyAgentRuntimeError(error), 'OPENAI_QUOTA_EXCEEDED');
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_QUOTA_EXCEEDED'), true);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
    } else {
      process.env.AGENT_ERROR_IMMEDIATE_HANDOFF = previous;
    }
  }
});
