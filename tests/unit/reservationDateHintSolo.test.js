'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReservationDateHint } = require('../../services/agent/reservationDateHint');
const { resolveDateFromText } = require('../../nlp/dateResolver');

test("sexta sozinha e única confirma a data e não pede 'você quer dizer'", () => {
  const sexta = resolveDateFromText('sexta');
  const hint = buildReservationDateHint({
    userText: 'sexta',
    referenceDateIso: '2026-10-29',
    workingState: { establishment_id: 8 },
  });

  assert.equal(hint.patch.reservation_date, sexta.iso);
  assert.ok(hint.patch.reservation_date);
  assert.equal(hint.patch.reservation_date_confirmed, true);
  assert.equal(hint.confirmed, true);
  assert.equal(hint.patch.pending_reservation_date_iso, null);
  assert.doesNotMatch(String(hint.promptBlock || ''), /voc[eê] quer dizer/i);
});

test('sexta que vem ambígua continua pedindo confirmação do dia', () => {
  const hint = buildReservationDateHint({
    userText: 'sexta que vem',
    referenceDateIso: '2026-10-29',
    workingState: { establishment_id: 8 },
  });

  assert.equal(hint.confirmed, false);
  assert.notEqual(hint.patch.reservation_date_confirmed, true);
  assert.ok(hint.patch.pending_reservation_date_iso);
});
