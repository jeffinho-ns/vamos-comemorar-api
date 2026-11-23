const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandboxQuestion, pinFocusedFaq, summarizeFaqRead } = require('../../services/agent/faqSandbox');

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

test('pinFocusedFaq coloca a ficha citada na frente da leitura', () => {
  const pinned = pinFocusedFaq(
    [{ topic: 'dias_horarios_funcionamento', answer: 'Abrimos às 18h.', fallback: false }],
    {
      topic: 'aviso_bloqueio_agenda_2026_11_15_area_3',
      answer: 'Área VIP indisponível em 15/11/2026.',
    },
  );
  assert.equal(pinned[0].topic, 'aviso_bloqueio_agenda_2026_11_15_area_3');
  assert.equal(pinned.length, 2);
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

test('runFaqReadTest com título exato ignora ficha de substring e responde verbatim', async () => {
  const { invalidateFaqCache } = require('../../services/agent/faqPrefetchService');
  const { runFaqReadTest } = require('../../services/agent/faqSandbox');
  invalidateFaqCache();

  const answer =
    'REGRA: após se apresentar sempre perguntar se o cliente já conhece o Reserva Rooftop, e quais informações ele gostaria de saber.';
  const longTopic = 'departamento de compras, fornecedores e apresentacao de produtos';
  const rows = [
    {
      topic: longTopic,
      answer: 'Fluxo interno de compras e apresentação de produtos aos fornecedores.',
      updated_at: new Date('2026-11-22T12:00:00Z'),
    },
    { topic: 'apresentacao', answer, updated_at: new Date('2026-11-19T12:00:00Z') },
  ];
  const pool = {
    async query(sql, params = []) {
      if (String(sql).includes('FROM places')) {
        return { rows: [{ name: 'Reserva Rooftop' }] };
      }
      if (String(sql).includes('assistant_settings') || String(sql).includes('FROM assistant')) {
        return { rows: [] };
      }
      if (String(sql).includes('ORDER BY updated_at DESC NULLS LAST, topic ASC')) {
        return { rows };
      }
      const topic = params[1];
      const row = rows.find((item) => item.topic === topic);
      return { rows: row ? [row] : [] };
    },
  };

  const result = await runFaqReadTest(pool, {
    establishmentId: 99,
    message: 'Oi, pode me explicar sobre apresentacao?',
    focusTopic: 'apresentacao',
  });

  assert.equal(result.verbatim, true);
  assert.equal(result.usedModel, false);
  assert.deepEqual(result.sources, ['apresentacao']);
  assert.match(result.reply, /já conhece o Reserva Rooftop/i);
  assert.doesNotMatch(result.reply, /compras|fornecedores/i);
  assert.doesNotMatch(result.reply, /programação|programacao/i);
});
