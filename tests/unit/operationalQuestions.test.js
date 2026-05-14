const test = require('node:test');
const assert = require('node:assert/strict');
const {
  looksLikeAvailabilityQuestion,
  looksLikeAreaQuestion,
  looksLikePetQuestion,
  looksLikeFreshReservationStart,
} = require('../../services/conversationEngine/helpers');

test('disponibilidade de área não é tratada como pergunta de horário', () => {
  assert.equal(looksLikeAvailabilityQuestion('Vamos tentar de novo, qual área tem disponível?'), false);
  assert.equal(looksLikeAreaQuestion('Vamos tentar de novo, qual área tem disponível?'), true);
});

test('pergunta combinada de horários e áreas', () => {
  const message = 'Quais horários tem disponíveis e quais áreas tem disponíveis?';
  assert.equal(looksLikeAvailabilityQuestion(message), true);
  assert.equal(looksLikeAreaQuestion(message), true);
});

test('pergunta sobre pet reconhece intenção de levar animal', () => {
  assert.equal(looksLikePetQuestion('Posso levar meu bolo?'), true);
  assert.equal(looksLikePetQuestion('Posso levar meu cachorro?'), true);
});

test('reinício de conversa inclui vamos tentar de novo', () => {
  assert.equal(looksLikeFreshReservationStart('Vamos tentar de novo, qual área tem disponível?'), true);
});
