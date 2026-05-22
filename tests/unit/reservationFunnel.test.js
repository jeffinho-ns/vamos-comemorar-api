const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isReservationFunnelInProgress,
  shouldSkipFaqFirst,
  getReservationMissingFields,
  buildNextFieldQuestion,
  parseReservationFieldsFromUserText,
  looksLikeDeferredAvailabilityCheck,
  shouldAutoRunAvailabilityCheck,
} = require('../../services/agent/reservationFunnel');

test('isReservationFunnelInProgress quando há estabelecimento e data', () => {
  assert.equal(
    isReservationFunnelInProgress(
      { establishment_id: 7, reservation_date: '2026-05-24' },
      []
    ),
    true
  );
});

test('shouldSkipFaqFirst durante funil ativo', () => {
  assert.equal(
    shouldSkipFaqFirst(
      { establishment_id: 7, reservation_date: '2026-05-24', reservation_time: '20:00' },
      [{ role: 'user', content: 'quero reservar mesa' }]
    ),
    true
  );
});

test('parseReservationFieldsFromUserText extrai horário e pessoas', () => {
  const patch = parseReservationFieldsFromUserText('somos 4 pessoas às 20h', {});
  assert.equal(patch.quantidade_convidados, 4);
  assert.equal(patch.reservation_time, '20:00');
});

test('parseReservationFieldsFromUserText extrai data e 60 pessoas (caso print)', () => {
  const patch = parseReservationFieldsFromUserText('19/06 e 60 pessoas', { establishment_id: 7 });
  assert.equal(patch.quantidade_convidados, 60);
  assert.match(patch.reservation_date, /^2026-06-19$/);
});

test('looksLikeDeferredAvailabilityCheck detecta promessa sem retorno', () => {
  const text =
    'Perfeito! Vou verificar a disponibilidade para o dia 19/06 para 60 pessoas no HighLine. Um momento, por favor.';
  assert.equal(looksLikeDeferredAvailabilityCheck(text), true);
});

test('shouldAutoRunAvailabilityCheck com data e pessoas no estado', () => {
  assert.equal(
    shouldAutoRunAvailabilityCheck(
      {
        establishment_id: 7,
        reservation_date: '2026-06-19',
        quantidade_convidados: 60,
      },
      { lockedEstablishmentId: 7 },
      [],
      'Vou verificar a disponibilidade. Um momento.'
    ),
    true
  );
});

test('buildNextFieldQuestion pede próximo campo faltante', () => {
  const q = buildNextFieldQuestion({
    establishment_id: 7,
    reservation_date: '2026-05-24',
    reservation_time: '20:00',
    quantidade_convidados: 2,
  });
  assert.match(q, /nome|e-mail|nascimento/i);
});

test('getReservationMissingFields lista campos obrigatórios', () => {
  const missing = getReservationMissingFields({
    establishment_id: 7,
    reservation_date: '2026-05-24',
  });
  assert.ok(missing.includes('reservation_time'));
  assert.ok(missing.includes('client_name'));
});
