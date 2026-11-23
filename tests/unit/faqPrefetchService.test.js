const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectRelevantFaqTopics,
  invalidateFaqCache,
  loadRelevantFaqsForEstablishment,
  scoreFaqAgainstText,
  verbatimFaqReply,
} = require('../../services/agent/faqPrefetchService');

test.beforeEach(() => {
  invalidateFaqCache();
});

function makeCatalogPool(rows) {
  return {
    async query(sql, params = []) {
      if (String(sql).includes('ORDER BY updated_at DESC NULLS LAST, topic ASC')) {
        return { rows };
      }
      const topic = params[1];
      const row = rows.find((item) => item.topic === topic);
      return { rows: row ? [row] : [] };
    },
  };
}

test('pergunta sobre estacionamento devolve o texto cadastrado da casa', () => {
  const answer =
    'A casa não tem estacionamento próprio. Há um estacionamento ao lado, sem vínculo com a casa. O valor é informado no local; a equipe da casa não tem essa tabela.';
  const reply = verbatimFaqReply(
    [
      { topic: 'estacionamento', answer, fallback: false },
      {
        topic: 'dias_horarios_funcionamento',
        answer: 'Sábado das 14h às 5h.',
        fallback: false,
      },
    ],
    'Oi, pode me explicar sobre Estacionamento?',
    { topicHints: ['estacionamento'] }
  );

  assert.equal(reply, answer);
});

test('detectRelevantFaqTopics detecta estacionamento na pergunta atual', () => {
  const topics = detectRelevantFaqTopics(
    'Oi boa noite, me dê uma ajuda. No Highline tem estacionamento?',
    []
  );

  assert.ok(topics.includes('estacionamento'));
});

test('detectRelevantFaqTopics prioriza entrada com bebidas em vez de cover', () => {
  const topics = detectRelevantFaqTopics(
    'Oi, pode me explicar sobre Entrada com bebidas?',
    []
  );

  assert.ok(topics.includes('entrada_bebidas'));
  assert.equal(topics.includes('valores_entrada'), false);
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

test('scoreFaqAgainstText casa título livre mesmo com "sobre X" e acento', () => {
  assert.equal(
    scoreFaqAgainstText(
      { topic: 'entrada_bebidas', answer: 'Não é permitido entrar com bebidas.' },
      'Oi, pode me explicar sobre Entrada com bebidas?'
    ),
    100
  );
  assert.equal(
    scoreFaqAgainstText(
      { topic: 'apresentacao', answer: 'REGRA: após se apresentar sempre perguntar.' },
      'Oi, pode me explicar sobre apresentacao?'
    ),
    100
  );
  assert.ok(
    scoreFaqAgainstText(
      {
        topic: 'valores_entrada',
        answer: 'Terça e quarta não cobram entrada. Quinta couvert R$ 25.',
      },
      'Oi, pode me explicar sobre Entrada com bebidas?'
    ) < 40
  );
});

test('Justino: pergunta de entrada com bebidas lê a ficha certa, não a tabela de cover', async () => {
  const pool = makeCatalogPool([
    {
      topic: 'valores_entrada',
      answer:
        'A entrada depende do dia. Terça e quarta não cobram entrada. Quinta couvert artístico de R$ 25.',
      updated_at: new Date('2026-11-20T12:00:00Z'),
    },
    {
      topic: 'entrada_bebidas',
      answer: 'Não é permitido entrar com bebidas.',
      updated_at: new Date('2026-10-28T12:00:00Z'),
    },
  ]);

  const question = 'Oi, pode me explicar sobre Entrada com bebidas?';
  const topics = detectRelevantFaqTopics(question, []);
  const entries = await loadRelevantFaqsForEstablishment(pool, 1, topics, {
    userText: question,
  });

  assert.ok(entries.some((entry) => entry.topic === 'entrada_bebidas'));
  assert.equal(entries[0].topic, 'entrada_bebidas');
  assert.match(entries[0].answer, /n[aã]o [eé] permitido entrar com bebidas/i);
  assert.equal(
    entries.some((entry) => entry.topic === 'valores_entrada'),
    false
  );
});

test('pergunta com texto não inventa cover genérico de outra casa', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const entries = await loadRelevantFaqsForEstablishment(pool, 99, ['valores_entrada'], {
    userText: 'Oi, pode me explicar sobre apresentacao?',
  });
  assert.deepEqual(entries, []);
});

test('ficha REGRA customizada é encontrada mesmo no meio de dezenas de itens', async () => {
  const rows = [];
  for (let index = 0; index < 43; index += 1) {
    rows.push({
      topic: `filler_${index}`,
      answer: `Texto genérico número ${index} sobre horários e valores de entrada.`,
      updated_at: new Date(`2026-11-${String((index % 27) + 1).padStart(2, '0')}T12:00:00Z`),
    });
  }
  rows.push({
    topic: 'apresentacao',
    answer:
      'REGRA: após se apresentar sempre perguntar se o cliente já conhece o Reserva Rooftop, e quais informações ele gostaria de saber.',
    updated_at: new Date('2026-11-19T12:00:00Z'),
  });

  const pool = makeCatalogPool(rows);
  const question = 'Oi, pode me explicar sobre apresentacao?';
  const topics = detectRelevantFaqTopics(question, []);
  const entries = await loadRelevantFaqsForEstablishment(pool, 99, topics, {
    userText: question,
  });

  assert.ok(entries.some((entry) => entry.topic === 'apresentacao'));
  assert.match(entries.find((entry) => entry.topic === 'apresentacao').answer, /Reserva Rooftop/i);
});

const APRESENTACAO_BODY =
  'REGRA: após se apresentar sempre perguntar se o cliente já conhece o Reserva Rooftop, e quais informações ele gostaria de saber.';
const APRESENTACAO_SUBSTRING_TOPIC =
  'departamento de compras, fornecedores e apresentacao de produtos';

test('título apresentacao não casa ficha cujo título só contém a substring', () => {
  const longCard = {
    topic: APRESENTACAO_SUBSTRING_TOPIC,
    answer: 'Fluxo interno de compras e apresentação de produtos aos fornecedores.',
  };
  const exactCard = { topic: 'apresentacao', answer: APRESENTACAO_BODY };
  const question = 'Oi, pode me explicar sobre apresentacao?';

  assert.equal(scoreFaqAgainstText(exactCard, question), 100);
  assert.ok(scoreFaqAgainstText(longCard, question) < 70);
});

test('pergunta sobre apresentacao lê só a ficha do título exato, sem substring', async () => {
  const pool = makeCatalogPool([
    {
      topic: APRESENTACAO_SUBSTRING_TOPIC,
      answer: 'Fluxo interno de compras e apresentação de produtos aos fornecedores.',
      updated_at: new Date('2026-11-22T12:00:00Z'),
    },
    {
      topic: 'apresentacao',
      answer: APRESENTACAO_BODY,
      updated_at: new Date('2026-11-19T12:00:00Z'),
    },
  ]);

  const question = 'Oi, pode me explicar sobre apresentacao?';
  const topics = detectRelevantFaqTopics(question, []);
  const entries = await loadRelevantFaqsForEstablishment(pool, 99, topics, {
    userText: question,
    extraTopics: ['apresentacao'],
  });

  assert.deepEqual(
    entries.map((entry) => entry.topic),
    ['apresentacao']
  );
  assert.match(entries[0].answer, /já conhece o Reserva Rooftop/i);
  assert.equal(
    entries.some((entry) => entry.topic === APRESENTACAO_SUBSTRING_TOPIC),
    false
  );
});
