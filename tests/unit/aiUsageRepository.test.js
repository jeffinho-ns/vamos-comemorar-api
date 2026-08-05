const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractUsageFields,
  runWithOpenAiUsageContext,
  getOpenAiUsageContext,
  recordOpenAiUsageSafe,
} = require('../../services/agent/aiUsageRepository');

test('extractUsageFields lê tokens e cached_tokens', () => {
  const fields = extractUsageFields({
    prompt_tokens: 120,
    completion_tokens: 45,
    total_tokens: 165,
    prompt_tokens_details: { cached_tokens: 80 },
  });

  assert.deepEqual(fields, {
    promptTokens: 120,
    completionTokens: 45,
    totalTokens: 165,
    cachedTokens: 80,
  });
});

test('extractUsageFields tolera usage ausente', () => {
  assert.deepEqual(extractUsageFields(null), {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    cachedTokens: null,
  });
});

test('runWithOpenAiUsageContext expõe contexto no escopo async', async () => {
  await runWithOpenAiUsageContext({ establishmentId: 7, path: 'agent' }, async () => {
    assert.deepEqual(getOpenAiUsageContext(), { establishmentId: 7, path: 'agent' });
  });
  assert.deepEqual(getOpenAiUsageContext(), {});
});

test('recordOpenAiUsageSafe nunca lança quando pool falha', async () => {
  const pool = {
    async query() {
      throw new Error('db down');
    },
  };

  await assert.doesNotReject(() =>
    recordOpenAiUsageSafe(pool, {
      path: 'agent',
      model: 'gpt-5.5',
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    })
  );
});
