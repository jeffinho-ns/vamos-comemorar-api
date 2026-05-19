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

test('resolveDateFromText entende "proximo sabado"', () => {
  const result = resolveDateFromText('quero reserva no proximo sabado');
  assert.equal(result.ok, true);
  assert.equal(result.source, 'weekday_relative');
  const labels = formatReservationDateLabels(result.iso);
  assert.match(labels.confirmationPhrase, /sábado/i);
  assert.match(result.iso, /^202\d-/);
});

test('resolveDateFromConversation usa mensagem anterior', () => {
  const history = [
    { role: 'user', content: 'Quero reserva no proximo sabado' },
    { role: 'assistant', content: 'Claro!' },
    { role: 'user', content: 'Qual dia do mes seria?' },
  ];
  const { resolveDateFromConversation } = require('../../nlp/dateResolver');
  const result = resolveDateFromConversation(history[2].content, history);
  assert.equal(result.ok, true);
  const labels = formatReservationDateLabels(result.iso);
  assert.match(labels.weekdayName || labels.confirmationPhrase, /sábado/i);
});
