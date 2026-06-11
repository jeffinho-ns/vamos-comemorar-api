const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectRelevantFaqTopics,
  loadRelevantFaqsForEstablishment,
} = require('../../services/agent/faqPrefetchService');

test('detectRelevantFaqTopics detecta estacionamento na pergunta atual', () => {
  const topics = detectRelevantFaqTopics(
    'Oi boa noite, me dê uma ajuda. No Highline tem estacionamento?',
    []
  );

  assert.ok(topics.includes('estacionamento'));
});

test('loadRelevantFaqsForEstablishment usa fallback seguro se tópico básico não estiver cadastrado', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const entries = await loadRelevantFaqsForEstablishment(pool, 7, ['estacionamento']);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].topic, 'estacionamento');
  assert.equal(entries[0].fallback, true);
  assert.match(entries[0].answer, /estacionamento/i);
});
