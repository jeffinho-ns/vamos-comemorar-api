const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchFaqAnswerForTopic,
  loadAllActiveFaqsForEstablishment,
  invalidateFaqCache,
} = require('../../services/agent/faqPrefetchService');

function makePool(rowsByTopic = {}, allRows = null) {
  let queryCount = 0;
  const pool = {
    queryCount: () => queryCount,
    async query(sql, params = []) {
      queryCount += 1;
      if (sql.includes('ORDER BY updated_at DESC NULLS LAST, topic ASC')) {
        return { rows: allRows ?? [] };
      }
      const topic = params[1];
      const row = rowsByTopic[topic];
      return { rows: row ? [row] : [] };
    },
  };
  return pool;
}

test.beforeEach(() => {
  invalidateFaqCache();
});

test('fetchFaqAnswerForTopic usa cache no segundo acesso', async () => {
  const pool = makePool({
    estacionamento: {
      topic: 'estacionamento',
      answer: 'Temos valet na rua ao lado.',
      updated_at: new Date('2026-01-01T12:00:00Z'),
    },
  });

  const first = await fetchFaqAnswerForTopic(pool, 42, 'estacionamento');
  const queriesAfterFirst = pool.queryCount();
  const second = await fetchFaqAnswerForTopic(pool, 42, 'estacionamento');

  assert.equal(pool.queryCount(), queriesAfterFirst);
  assert.equal(first.topic, 'estacionamento');
  assert.equal(second.answer, first.answer);
});

test('fetchFaqAnswerForTopic refaz query após invalidateFaqCache', async () => {
  const pool = makePool({
    estacionamento: {
      topic: 'estacionamento',
      answer: 'Temos valet na rua ao lado.',
      updated_at: new Date('2026-01-01T12:00:00Z'),
    },
  });

  await fetchFaqAnswerForTopic(pool, 42, 'estacionamento');
  const queriesAfterFirst = pool.queryCount();
  invalidateFaqCache(42);
  await fetchFaqAnswerForTopic(pool, 42, 'estacionamento');

  assert.ok(pool.queryCount() > queriesAfterFirst);
});

test('loadAllActiveFaqsForEstablishment usa cache no segundo acesso', async () => {
  const pool = makePool(
    {},
    [
      {
        topic: 'horario',
        answer: 'Abrimos às 18h.',
        updated_at: new Date('2026-01-02T12:00:00Z'),
      },
      {
        topic: 'estacionamento',
        answer: 'Valet disponível.',
        updated_at: new Date('2026-01-01T12:00:00Z'),
      },
    ],
  );

  const first = await loadAllActiveFaqsForEstablishment(pool, 7, { maxChars: 8000 });
  const second = await loadAllActiveFaqsForEstablishment(pool, 7, { maxChars: 1200 });

  assert.equal(pool.queryCount(), 1);
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
});

test('loadAllActiveFaqsForEstablishment refaz query após invalidateFaqCache', async () => {
  const pool = makePool(
    {},
    [
      {
        topic: 'horario',
        answer: 'Abrimos às 18h.',
        updated_at: new Date('2026-01-02T12:00:00Z'),
      },
    ],
  );

  await loadAllActiveFaqsForEstablishment(pool, 7);
  invalidateFaqCache(7);
  await loadAllActiveFaqsForEstablishment(pool, 7);

  assert.equal(pool.queryCount(), 2);
});

test('retorno do cache é clone — mutação não altera próxima leitura', async () => {
  const pool = makePool({
    estacionamento: {
      topic: 'estacionamento',
      answer: 'Resposta original.',
      updated_at: new Date('2026-01-01T12:00:00Z'),
    },
  });

  const first = await fetchFaqAnswerForTopic(pool, 99, 'estacionamento');
  first.answer = 'Resposta alterada.';

  const second = await fetchFaqAnswerForTopic(pool, 99, 'estacionamento');
  assert.equal(second.answer, 'Resposta original.');
});
