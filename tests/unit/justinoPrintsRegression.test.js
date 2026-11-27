/**
 * Perguntas reais do WhatsApp do Seu Justino (27/11/2026) em que a Sol
 * respondia "deixa eu confirmar com a equipe" com a ficha cadastrada.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { SEU_JUSTINO_FAQS } = require('../../services/agent/seuJustinoFaqCatalog');
const {
  detectRelevantFaqTopics,
  invalidateFaqCache,
  loadRelevantFaqsForEstablishment,
  scoreFaqAgainstText,
  selectDirectFaqEntries,
} = require('../../services/agent/faqPrefetchService');
const { isInformationalFaqTurn } = require('../../services/agent/faqTopicCanonical');
const { appendSalesPull } = require('../../services/agent/salesFunnelPull');
const { formatEventProgramPromptBlock } = require('../../services/agent/establishmentEventProgram');
const { tryFaqFirstReply } = require('../../services/agent/agentService');

const JUSTINO_ID = 1;
const MID_FUNNEL = {
  establishment_id: JUSTINO_ID,
  reservation_date: '2026-11-27',
  reservation_time: '21:00',
  quantidade_convidados: 8,
};

function justinoPool() {
  const rows = SEU_JUSTINO_FAQS.map((faq) => ({
    topic: faq.topic,
    answer: faq.answer,
    category: faq.category,
    updated_at: new Date('2026-11-20T12:00:00Z'),
  }));
  return {
    async query(sql, params = []) {
      const text = String(sql);
      if (/AND topic = \$2/.test(text)) {
        return { rows: rows.filter((row) => row.topic === params[1]) };
      }
      if (text.includes('ORDER BY updated_at DESC NULLS LAST, topic ASC')) return { rows };
      return { rows: [] };
    },
  };
}

async function loadInFunnel(question, history = []) {
  const topics = detectRelevantFaqTopics(question, history, {
    funnelActive: true,
    establishmentId: JUSTINO_ID,
  });
  const entries = await loadRelevantFaqsForEstablishment(justinoPool(), JUSTINO_ID, topics, {
    funnelActive: true,
    userText: question,
  });
  return entries.map((entry) => entry.topic);
}

test.beforeEach(() => {
  invalidateFaqCache();
});

test('reserva em andamento: "Tem feijoada na casa?" chega na ficha do domingo', async () => {
  const topics = await loadInFunnel('Tem feijoada na casa?');
  assert.ok(topics.includes('informacoes_domingo'), topics.join(','));
});

test('reserva em andamento: benefício de aniversário chega na ficha de aniversário', async () => {
  const topics = await loadInFunnel('Qual o benefício de aniversário?');
  assert.ok(topics.includes('beneficios_aniversario'), topics.join(','));
});

test('reserva em andamento: estilo e funcionamento da casa chegam com fatos da casa', async () => {
  for (const question of ['Qual o estilo da casa?', 'Como funciona a casa']) {
    const topics = await loadInFunnel(question);
    assert.ok(
      topics.includes('sobre_a_casa') ||
        (topics.includes('estrutura_funcionamento') && topics.includes('musica')),
      `${question} → ${topics.join(',')}`
    );
  }
});

test('reserva em andamento: atrações chegam na ficha de música', async () => {
  const topics = await loadInFunnel('Quais são as atrações?');
  assert.ok(topics.includes('musica'), topics.join(','));
});

test('reserva em andamento: como funciona reserva de mesa chega na ficha dedicada', async () => {
  const topics = await loadInFunnel('Como funciona reserva de mesa?');
  assert.ok(
    topics.includes('como_funciona_reserva') ||
      topics.includes('mesas_assentos') ||
      topics.includes('areas_mesas_camarotes_diferenca'),
    topics.join(',')
  );
});

test('fichas novas e áreas não vazam jargão de painel', () => {
  for (const topic of ['sobre_a_casa', 'cardapio', 'como_funciona_reserva', 'musica']) {
    assert.ok(
      SEU_JUSTINO_FAQS.some((faq) => faq.topic === topic),
      `falta ficha ${topic}`
    );
  }
  assert.equal(
    SEU_JUSTINO_FAQS.some((faq) => /^programacao_(01|02|15)_11$/.test(faq.topic)),
    false
  );
  for (const topic of ['mesas_assentos', 'areas_mesas_camarotes_diferenca', 'como_funciona_reserva']) {
    const faq = SEU_JUSTINO_FAQS.find((entry) => entry.topic === topic);
    assert.ok(faq, topic);
    assert.doesNotMatch(faq.answer, /painel|sub[aá]rea/i);
  }
});

test('reserva em andamento sem pergunta não despeja a base', async () => {
  assert.deepEqual(await loadInFunnel('beleza'), []);
});

test('palavra só no corpo da ficha entra no prompt mas não vira resposta copiada', () => {
  const domingo = SEU_JUSTINO_FAQS.find((faq) => faq.topic === 'informacoes_domingo');
  const score = scoreFaqAgainstText(domingo, 'Tem feijoada na casa?');
  assert.ok(score >= 40 && score < 55, `score=${score}`);
  assert.deepEqual(selectDirectFaqEntries([domingo], 'Tem feijoada na casa?'), []);
});

test('ficha com nome que contém palavra-chave genérica é lida pelo próprio nome', async () => {
  for (const topic of ['estrutura_funcionamento', 'mesas_assentos', 'area_kids', 'documento_entrada', 'entrada_bebidas']) {
    const entries = await loadRelevantFaqsForEstablishment(justinoPool(), JUSTINO_ID, [topic], {
      funnelActive: true,
    });
    assert.equal(entries[0]?.topic, topic);
  }
});

test('ficha única sem relação não responde pergunta qualquer', () => {
  const horario = SEU_JUSTINO_FAQS.find((faq) => faq.topic === 'dias_horarios_funcionamento');
  assert.deepEqual(selectDirectFaqEntries([horario], 'Qual o nome do gerente?'), []);
});

test('perguntas soltas sobre a casa contam como pergunta informativa', () => {
  assert.equal(isInformationalFaqTurn('Tem feijoada na casa?'), true);
  assert.equal(isInformationalFaqTurn('Qual o estilo da casa?'), true);
  assert.equal(isInformationalFaqTurn('Tem vaga hoje?'), false);
  assert.equal(isInformationalFaqTurn('Tem vaga pra amanhã?'), false);
});

test('"vou confirmar com a equipe" não recebe pedido de e-mail na mesma mensagem', () => {
  const reply = 'Boa, deixa eu confirmar com a equipe as atrações de sexta e te respondo já.';
  assert.equal(appendSalesPull(reply, MID_FUNNEL), reply);
  assert.notEqual(appendSalesPull('Tem sim, R$ 30 depois das 21h.', MID_FUNNEL), 'Tem sim, R$ 30 depois das 21h.');
});

test('sem evento cadastrado, o bloco manda usar a ficha do dia da semana', () => {
  const block = formatEventProgramPromptBlock({
    iso: '2026-11-27',
    label: 'sexta-feira, dia 27/11/2026',
    events: [],
  });
  assert.match(block, /dia da semana/);
  assert.match(block, /Só se nenhuma ficha cobrir/);
});

test('FAQ direta: atrações sem evento respondem com a ficha da sexta da reserva', async () => {
  const result = await tryFaqFirstReply({
    pool: justinoPool(),
    messageHistory: [
      { role: 'user', content: 'Seria para 27/11' },
      { role: 'assistant', content: 'Perfeito, sexta-feira, 27/11. Que horas pretende chegar e para quantas pessoas?' },
      { role: 'user', content: 'Quais são as atrações?' },
    ],
    context: { lockedEstablishmentId: JUSTINO_ID, lockedEstablishmentName: 'Seu Justino' },
    memory: { workingState: MID_FUNNEL },
  });
  assert.match(result.replyText, /sertanejo, pagode e DJ/);
  assert.doesNotMatch(result.replyText, /confirmar com a equipe/i);
});

test('FAQ direta: assunto de pergunta antiga não sequestra a resposta nova', async () => {
  const result = await tryFaqFirstReply({
    pool: justinoPool(),
    messageHistory: [
      { role: 'user', content: 'Qual o benefício de aniversário?' },
      { role: 'assistant', content: 'O aniversariante tem entrada VIP para si e um acompanhante.' },
      { role: 'user', content: 'Tem feijoada na casa?' },
    ],
    context: { lockedEstablishmentId: JUSTINO_ID, lockedEstablishmentName: 'Seu Justino' },
    memory: { workingState: MID_FUNNEL },
  });
  assert.doesNotMatch(String(result?.replyText || ''), /aniversariante/i);
});
