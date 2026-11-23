const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandboxQuestion, summarizeFaqRead } = require('../../services/agent/faqSandbox');

test('buildSandboxQuestion inclui a data simulada na pergunta lida pela IA', () => {
  assert.equal(
    buildSandboxQuestion('o que tem hoje?', '2026-11-19'),
    'Hoje é 19/11/2026, agora são 12:00. o que tem hoje?'
  );
  assert.equal(
    buildSandboxQuestion('ainda está aberto?', '', '22:30'),
    'Agora são 22:30. ainda está aberto?'
  );
  assert.equal(buildSandboxQuestion('tem estacionamento?', '', ''), 'tem estacionamento?');
});

test('summarizeFaqRead só considera informação cadastrada, sem texto padrão', () => {
  const reading = summarizeFaqRead(
    [
      { topic: 'estacionamento', answer: 'Tem valet.', fallback: false },
      { topic: 'horario_funcionamento', answer: 'padrão', fallback: true },
    ],
    'estacionamento'
  );
  assert.deepEqual(reading.sources, ['estacionamento']);
  assert.equal(reading.readFocus, true);
});

test('summarizeFaqRead marca quando a ficha nova não entrou na leitura', () => {
  const reading = summarizeFaqRead(
    [{ topic: 'cardapio', answer: 'Tem drink.', fallback: false }],
    'estacionamento'
  );
  assert.equal(reading.readFocus, false);
});

test('summarizeFaqRead reconhece ficha citada no teste da IA', () => {
  const reading = summarizeFaqRead(
    [{ topic: 'apresentacao', answer: 'Perguntar se já conhece a casa.', fallback: false }],
    'apresentacao'
  );
  assert.equal(reading.readFocus, true);
  assert.deepEqual(reading.sources, ['apresentacao']);
});

test('runFaqReadTest devolve o corpo cadastrado da casa, sem fallback genérico', async () => {
  const { invalidateFaqCache } = require('../../services/agent/faqPrefetchService');
  const { runFaqReadTest } = require('../../services/agent/faqSandbox');
  invalidateFaqCache();

  const answer =
    'REGRA: após se apresentar sempre perguntar se o cliente já conhece o Reserva Rooftop, e quais informações ele gostaria de saber.';
  const pool = {
    async query(sql, params = []) {
      if (String(sql).includes('FROM places')) {
        return { rows: [{ name: 'Reserva Rooftop' }] };
      }
      if (String(sql).includes('ORDER BY updated_at DESC NULLS LAST, topic ASC')) {
        return { rows: [{ topic: 'apresentacao', answer, updated_at: new Date() }] };
      }
      if (params[1] === 'apresentacao') {
        return { rows: [{ topic: 'apresentacao', answer, updated_at: new Date() }] };
      }
      return { rows: [] };
    },
  };

  const result = await runFaqReadTest(pool, {
    establishmentId: 99,
    message: 'Oi, pode me explicar sobre apresentacao?',
    focusTopic: 'apresentacao',
  });

  assert.equal(result.verbatim, true);
  assert.equal(result.usedModel, false);
  assert.match(result.reply, /Reserva Rooftop/);
  assert.doesNotMatch(result.reply, /não encontrei/i);
  assert.doesNotMatch(result.reply, /cover|R\$\s*25/i);
  assert.deepEqual(result.sources, ['apresentacao']);
});
