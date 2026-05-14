const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectEstablishmentFromText,
  resolveEstablishmentForTurn,
  looksLikeFreshReservationStart,
} = require('../../services/conversationEngine/helpers');

const establishments = [
  { id: 1, name: 'Seu Justino' },
  { id: 4, name: 'Oh Fregues' },
  { id: 8, name: 'Pracinha do Seu Justino' },
  { id: 9, name: 'Reserva Rooftop' },
];

test('detectEstablishmentFromText prioriza o nome mais específico', () => {
  assert.equal(
    detectEstablishmentFromText('Me ajude no Pracinha do Seu Justino no sábado', establishments),
    8
  );
  assert.equal(
    detectEstablishmentFromText('Eu quero uma nova reserva no estabelecimento Reserva Rooftop', establishments),
    9
  );
});

test('resolveEstablishmentForTurn usa o estabelecimento citado na mensagem atual', () => {
  assert.equal(
    resolveEstablishmentForTurn({
      messageText: 'Eu quero fazer uma nova reserva no Reserva Rooftop no dia 16/05/2026',
      messageHistory: [],
      establishments,
      lockedEstablishmentId: 4,
      conversationEstablishmentId: 4,
      collectedFields: { establishment_id: 4, reservation_date: '2026-05-16' },
    }),
    9
  );
});

test('looksLikeFreshReservationStart reconhece reinício de reserva', () => {
  assert.equal(
    looksLikeFreshReservationStart('Eu quero uma nova reserva no estabelecimento Reserva Rooftop'),
    true
  );
  assert.equal(looksLikeFreshReservationStart('17:00'), false);
});
