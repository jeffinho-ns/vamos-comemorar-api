const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatTrainingReply,
  shouldPreferDirectFaqReply,
  pickBestFaqEntry,
  truncateCurta,
} = require('../../services/agent/trainingReplyFormatter');

const baseSettings = {
  assistant_name: 'Luna',
  gender: 'feminino',
  response_size: 'media',
  tone: 'amigavel',
  use_emojis: true,
  use_greeting: true,
  greet_when_already_greeted: false,
};

test('formatTrainingReply adiciona saudação com nome no primeiro turno', () => {
  const answer =
    'O dress code é casual elegante — evite chinelos e bermudas rasgadas. Se quiser confirmar algum detalhe específico, a equipe te orienta na hora.';

  const result = formatTrainingReply({
    answer,
    topic: 'dress_code',
    settings: baseSettings,
    messageHistory: [],
  });

  assert.equal(result.usedSettings, true);
  assert.match(result.text, /^Oi! Aqui é a Luna/);
  assert.match(result.text, /dress code é casual elegante/i);
});

test('formatTrainingReply remove emojis quando use_emojis é false', () => {
  const answer = 'Funcionamos sexta e sábado 🎉 Aos sábados abrimos às 16h.';

  const result = formatTrainingReply({
    answer,
    settings: { ...baseSettings, use_emojis: false, use_greeting: false },
    messageHistory: [{ role: 'user', content: 'horário?' }, { role: 'user', content: 'e sábado?' }],
  });

  assert.equal(result.usedSettings, true);
  assert.ok(!/🎉/.test(result.text));
  assert.match(result.text, /Funcionamos sexta e sábado/);
});

test('formatTrainingReply trunca resposta curta', () => {
  const answer =
    'Primeira frase com detalhes importantes sobre o funcionamento. Segunda frase também relevante para o cliente. Terceira frase com informação extra que não deve aparecer na versão curta porque ultrapassa o limite configurado para respostas curtas no WhatsApp.';

  const truncated = truncateCurta(answer);
  assert.ok(truncated.length <= 280);
  assert.match(truncated, /Primeira frase/);
  assert.match(truncated, /Segunda frase/);
  assert.ok(!/Terceira frase/.test(truncated));

  const result = formatTrainingReply({
    answer,
    settings: { ...baseSettings, response_size: 'curta', use_greeting: false },
    messageHistory: [{ role: 'user', content: 'horário?' }, { role: 'user', content: 'detalhes?' }],
  });

  assert.equal(result.usedSettings, true);
  assert.ok(result.text.length <= 280);
  assert.ok(!/Terceira frase/.test(result.text));
});

test('shouldPreferDirectFaqReply retorna true para FAQ única de dress_code', () => {
  const faqEntries = [
    {
      topic: 'dress_code',
      answer:
        'O dress code é casual elegante — evite chinelos e bermudas rasgadas. Se quiser confirmar algum detalhe específico, a equipe te orienta na hora.',
    },
  ];

  const prefer = shouldPreferDirectFaqReply({
    userText: 'qual o dress code?',
    faqEntries,
    topicHints: ['dress_code'],
  });

  assert.equal(prefer, true);
});

test('shouldPreferDirectFaqReply retorna false para intent de reserva sem overlap informativo', () => {
  const prefer = shouldPreferDirectFaqReply({
    userText: 'quero reservar mesa para sábado',
    faqEntries: [
      {
        topic: 'como_reservar',
        answer: 'Show! Pra reservar, me passa a data, quantas pessoas e seu nome completo.',
      },
    ],
    topicHints: ['como_reservar'],
  });

  assert.equal(prefer, false);
});

test('pickBestFaqEntry prioriza o tópico detectado', () => {
  const best = pickBestFaqEntry(
    [
      { topic: 'estacionamento', answer: 'Tem valet.' },
      { topic: 'dress_code', answer: 'O traje é casual elegante.' },
    ],
    ['dress_code']
  );

  assert.equal(best.topic, 'dress_code');
});

test('FAQ_DIRECT_REPLY=false desativa resposta direta', () => {
  const previous = process.env.FAQ_DIRECT_REPLY;
  process.env.FAQ_DIRECT_REPLY = 'false';

  try {
    assert.equal(
      shouldPreferDirectFaqReply({
        userText: 'qual o dress code?',
        faqEntries: [{ topic: 'dress_code', answer: 'O traje é casual elegante.' }],
        topicHints: ['dress_code'],
      }),
      false
    );
  } finally {
    if (previous === undefined) delete process.env.FAQ_DIRECT_REPLY;
    else process.env.FAQ_DIRECT_REPLY = previous;
  }
});
