const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDateFromText,
  formatReservationDateLabels,
} = require('../../nlp/dateResolver');

test('resolveDateFromText entende "reserva para sexta" e pede confirmação', () => {
  const result = resolveDateFromText('Eu quero uma reserva para sexta');
  assert.equal(result.ok, true);
  assert.equal(result.source, 'weekday_relative');
  assert.equal(result.needsConfirmation, true);
  assert.match(result.iso, /^\d{4}-\d{2}-\d{2}$/);
});

test('resolveDateFromText entende "essa sexta"', () => {
  const result = resolveDateFromText('quero reserva para essa sexta');
  assert.equal(result.ok, true);
  assert.equal(result.needsConfirmation, true);
});

test('formatReservationDateLabels gera frase para confirmação', () => {
  const labels = formatReservationDateLabels('2026-06-19');
  assert.match(labels.weekdayWithDate, /sexta-feira, dia 19\/06/);
  assert.match(labels.confirmationPhrase, /2026/);
});
