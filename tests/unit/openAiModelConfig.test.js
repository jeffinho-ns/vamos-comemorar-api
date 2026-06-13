const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeOpenAiModelName } = require('../../services/agent/openAiConfig');
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

test('INSUFFICIENT_QUOTA não dispara handoff automático para humano', () => {
  const previous = process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
  process.env.AGENT_ERROR_IMMEDIATE_HANDOFF = 'true';

  try {
    const error = new Error(
      'Falha na OpenAI: You exceeded your current quota (status=429 code=INSUFFICIENT_QUOTA model=gpt-5.5)'
    );
    error.code = 'INSUFFICIENT_QUOTA';
    error.status = 429;

    assert.equal(classifyAgentRuntimeError(error), 'OPENAI_QUOTA_EXCEEDED');
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_QUOTA_EXCEEDED'), false);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
    } else {
      process.env.AGENT_ERROR_IMMEDIATE_HANDOFF = previous;
    }
  }
});
