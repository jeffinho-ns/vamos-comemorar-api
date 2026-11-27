const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeFaqAnswer,
  customerFacingFaqText,
  fallbackInstructionReply,
} = require('../../services/agent/faqAnswerRole');

const CANCELAMENTO =
  'Se pedirem cancelamento, primeiro pergunte o motivo com calma e confirme se quer mesmo cancelar. Quando couber, ofereça remarcar e lembre um benefício da casa. O link de cancelamento só sai depois que o cliente confirmar que quer cancelar de vez.';

test('cancelamento é orientação e não vira fala copiada', () => {
  const analyzed = analyzeFaqAnswer(CANCELAMENTO);
  assert.equal(analyzed.execute, true);
  assert.equal(customerFacingFaqText(CANCELAMENTO), '');

  const reply = fallbackInstructionReply(
    CANCELAMENTO,
    'Oi, pode me explicar sobre Cancelamento de reserva?'
  );
  assert.match(reply, /motivo/i);
  assert.doesNotMatch(reply, /se pedirem cancelamento/i);
  assert.doesNotMatch(reply, /link de cancelamento só sai/i);
});

test('depois do motivo, a orientação pede confirmação antes do link', () => {
  const reply = fallbackInstructionReply(
    CANCELAMENTO,
    'Vou viajar e não consigo ir',
    [{ role: 'user', content: 'Oi, pode me explicar sobre Cancelamento de reserva?' }]
  );
  assert.match(reply, /remarcar|mesmo cancelar/i);
  assert.doesNotMatch(reply, /se pedirem/i);
  assert.doesNotMatch(reply, /chamar uma pessoa/i);
});

test('depois de confirmar o cancelamento, avisa que vai chamar alguém para o procedimento', () => {
  const history = [
    { role: 'user', content: 'Oi, pode me explicar sobre Cancelamento de reserva?' },
    {
      role: 'assistant',
      content: 'Claro. Me conta o motivo, com calma? Quero entender o que aconteceu antes de seguir.',
    },
    { role: 'user', content: 'Não vou conseguir estar na cidade no dia' },
    {
      role: 'assistant',
      content: 'Entendi. Você quer mesmo cancelar, ou prefere que eu veja outro dia pra remarcar?',
    },
  ];

  for (const message of ['quero cancelar', 'Cancelar', 'sim']) {
    const reply = fallbackInstructionReply(CANCELAMENTO, message, history);
    assert.match(reply, /chamar uma pessoa/i);
    assert.match(reply, /procedimento/i);
    assert.doesNotMatch(reply, /quer mesmo cancelar/i);
  }
});

test('endereço continua resposta pronta', () => {
  const answer =
    'O endereço é Rua Harmonia, 77, Vila Madalena. Os metrôs mais próximos são Fradique Coutinho, na Linha 4-Amarela, e Vila Madalena, na Linha 2-Verde.';
  const analyzed = analyzeFaqAnswer(answer);
  assert.equal(analyzed.mode, 'reply');
  assert.equal(analyzed.execute, false);
  assert.equal(customerFacingFaqText(answer), answer);
});

test('fato com "cite só" perde a orientação e fica com o conteúdo', () => {
  const answer =
    'Às terças a casa funciona das 18h à 1h, sem entrada. Cite só o que o cliente perguntou. Valores podem mudar.';
  const spoken = customerFacingFaqText(answer);
  assert.match(spoken, /18h/);
  assert.match(spoken, /Valores podem mudar/);
  assert.doesNotMatch(spoken, /cite só/i);
});

test('apresentação com prefixo REGRA vira pergunta, não o texto da regra', () => {
  const answer =
    'REGRA: após se apresentar sempre perguntar se o cliente já conhece o Reserva Rooftop, e quais informações ele gostaria de saber.';
  assert.equal(analyzeFaqAnswer(answer).execute, true);
  const reply = fallbackInstructionReply(answer, 'Oi, pode me explicar sobre apresentacao?');
  assert.match(reply, /já conhece/i);
  assert.doesNotMatch(reply, /sempre perguntar/i);
});

test('regra "já conhece" não interrompe reserva em andamento', () => {
  const answer =
    'REGRA: após se apresentar sempre perguntar se o cliente já conhece o Seu Justino.';
  const history = [
    { role: 'user', content: 'Quero reservar para sexta' },
    { role: 'assistant', content: 'Perfeito. Que horas e para quantas pessoas?' },
  ];
  const reply = fallbackInstructionReply(answer, 'Como funciona a casa?', history);
  assert.doesNotMatch(reply, /já conhece/i);
  assert.match(reply, /quer saber|oriento/i);
});
