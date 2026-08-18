const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLargeReservationStatus,
  normalizeLargeReservationOrigin,
  tablesPayloadFromTableNumber,
} = require('../../services/largeReservationEnums');

test('origin do admin (PESSOAL) vira ADMIN no enum de large_reservations', () => {
  assert.equal(normalizeLargeReservationOrigin('PESSOAL'), 'ADMIN');
  assert.equal(normalizeLargeReservationOrigin('SITE'), 'CLIENTE');
  assert.equal(normalizeLargeReservationOrigin('WIDGET'), 'CLIENTE');
  assert.equal(normalizeLargeReservationOrigin('TELEFONE'), 'CLIENTE');
});

test('status do modal (CONCLUIDA / checked-in) cabe no enum da tabela', () => {
  assert.equal(normalizeLargeReservationStatus('CONCLUIDA'), 'COMPLETED');
  assert.equal(normalizeLargeReservationStatus('checked-in'), 'CHECKED_IN');
  assert.equal(normalizeLargeReservationStatus('confirmed'), 'CONFIRMADA');
  assert.equal(normalizeLargeReservationStatus('NO_SHOW'), 'CANCELADA');
  assert.equal(normalizeLargeReservationStatus('NOVA'), 'NOVA');
});

test('mesa vazia ou null não vira JSON ["null"]', () => {
  assert.equal(tablesPayloadFromTableNumber(null), null);
  assert.equal(tablesPayloadFromTableNumber(''), null);
  assert.deepEqual(tablesPayloadFromTableNumber('12, 14'), ['12', '14']);
});
