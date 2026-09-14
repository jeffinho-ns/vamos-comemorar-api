'use strict';

/**
 * Testes de datas e contagem (offline).
 * node tests/unit/staffAgentDates.test.js
 */

const assert = require('assert');
const {
  parseFlexibleDate,
  parseDateOrToday,
  extractDatesFromText,
  todayIsoSp,
} = require('../../services/staffAgent/dateUtils');
const { wantsReservationCount } = require('../../services/staffAgent/reservationCountFastPath');

assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(todayIsoSp()));

assert.equal(parseFlexibleDate('2026-09-18'), '2026-09-18');
assert.equal(parseFlexibleDate('18/09/2026'), '2026-09-18');
assert.equal(parseDateOrToday('18/09/2026'), '2026-09-18');
// Bug antigo: DD/MM virava "hoje" — não pode mais.
assert.notEqual(parseDateOrToday('18/09/2026'), todayIsoSp() || 'force');

const range = extractDatesFromText('Eu quero saber do dia 18 até o dia 20/09');
assert.ok(range.includes('2026-09-18') || range.some((d) => d.endsWith('-09-18')));
assert.ok(range.length >= 3, `esperava >=3 datas, veio ${JSON.stringify(range)}`);

const listed = extractDatesFromText(
  'dias 18/09/2026, 19/09/2026, 20/09/2026'
);
assert.deepEqual(listed, ['2026-09-18', '2026-09-19', '2026-09-20']);

assert.equal(wantsReservationCount('quantas reservas tem para o final de semana'), true);
assert.equal(wantsReservationCount('quero que me diga quantas reservas tem para cada dia'), true);
assert.equal(wantsReservationCount('bloquear o dia 18'), false);

console.log('✅ staffAgentDates: parse e contagem ok');
