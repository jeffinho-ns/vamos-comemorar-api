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
