const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyAgentRuntimeError,
  shouldImmediateHumanHandoffOnAgentError,
} = require('../../services/conversationEngine/agentErrorPolicy');

test('handoff automático ignora erros transitórios da OpenAI', () => {
  const previous = process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
  process.env.AGENT_ERROR_IMMEDIATE_HANDOFF = 'true';

  try {
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_TIMEOUT'), false);
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_429'), false);
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_500'), false);
    assert.equal(shouldImmediateHumanHandoffOnAgentError('ECONNRESET'), false);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
    } else {
      process.env.AGENT_ERROR_IMMEDIATE_HANDOFF = previous;
    }
  }
});

test('handoff automático continua permitido para erro estrutural de configuração', () => {
  const previous = process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
  process.env.AGENT_ERROR_IMMEDIATE_HANDOFF = 'true';

  try {
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_MISSING_CREDENTIALS'), true);
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_AUTH'), true);
    assert.equal(shouldImmediateHumanHandoffOnAgentError('OPENAI_MODEL_ACCESS'), true);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_ERROR_IMMEDIATE_HANDOFF;
    } else {
      process.env.AGENT_ERROR_IMMEDIATE_HANDOFF = previous;
    }
  }
});

test('classificação identifica timeout da OpenAI como erro recuperável', () => {
  const error = new Error('OpenAI timeout após 25000ms');
  error.code = 'OPENAI_TIMEOUT';

  assert.equal(classifyAgentRuntimeError(error), 'OPENAI_TIMEOUT');
});
