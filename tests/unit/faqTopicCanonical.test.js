const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalizeAdminFaqTopic,
  detectFaqTopicsFromUserText,
  isInformationalFaqTurn,
} = require('../../services/agent/faqTopicCanonical');

test('canonicalizeAdminFaqTopic mapeia tópicos legados do admin', () => {
  assert.equal(canonicalizeAdminFaqTopic('horario_funcionamento'), 'dias_horarios_funcionamento');
  assert.equal(canonicalizeAdminFaqTopic('aniversarios'), 'beneficios_aniversario');
  assert.equal(canonicalizeAdminFaqTopic('vantagens_aniversariante'), 'beneficios_aniversario');
});

test('detectFaqTopicsFromUserText detecta horário e entrada no sábado', () => {
  const topics = detectFaqTopicsFromUserText('Como funciona o HighLine aos sábados? Horário e entrada?');
  assert.ok(topics.includes('dias_horarios_funcionamento'));
  assert.ok(topics.includes('valores_entrada'));
});

test('detectFaqTopicsFromUserText detecta benefícios de aniversário', () => {
  const topics = detectFaqTopicsFromUserText('Quais as vantagens para aniversariante no HighLine?');
  assert.deepEqual(topics, ['beneficios_aniversario']);
});

test('isInformationalFaqTurn reconhece dúvidas operacionais', () => {
  assert.equal(isInformationalFaqTurn('qual o horário no sábado?'), true);
  assert.equal(isInformationalFaqTurn('quais as vantagens para aniversariante?'), true);
});

test('looksLikeReservationPushOnly não bloqueia FAQ quando há pergunta mista', () => {
  const { looksLikeReservationPushOnly } = require('../../services/agent/faqTopicCanonical');
  assert.equal(looksLikeReservationPushOnly('quero reservar para sábado'), true);
});
