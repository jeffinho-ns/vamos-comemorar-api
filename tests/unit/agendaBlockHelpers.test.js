'use strict';

/**
 * node tests/unit/agendaBlockHelpers.test.js
 */

const assert = require('assert');
const {
  parseTimeHHMM,
  blockBounds,
  normalizeAreaName,
} = require('../../services/staffAgent/agendaBlockHelpers');
const {
  buildBlockFaqTopic,
  buildBlockFaqAnswer,
} = require('../../services/staffAgent/agendaBlockAiNote');

assert.equal(parseTimeHHMM('18h'), '18:00:00');
assert.equal(parseTimeHHMM('18:30'), '18:30:00');
assert.equal(parseTimeHHMM('9'), '09:00:00');
assert.equal(parseTimeHHMM('25:00'), null);

const sameDay = blockBounds('2026-09-20', '18:00:00', '22:00:00');
assert.equal(sameDay.start, '2026-09-20 18:00:00');
assert.equal(sameDay.end, '2026-09-20 22:00:00');

const multi = blockBounds('2026-09-20', '18:00:00', '02:00:00', '2026-09-21');
assert.equal(multi.start, '2026-09-20 18:00:00');
assert.equal(multi.end, '2026-09-21 02:00:00');
assert.equal(multi.endDateIso, '2026-09-21');

const topic = buildBlockFaqTopic({
  dateIso: '2026-09-20',
  areaId: 5,
  areaName: 'Terraço',
});
assert.equal(topic, 'aviso_bloqueio_agenda_2026-09-20_area_5');

const answer = buildBlockFaqAnswer({
  dateIso: '2026-09-20',
  areaName: 'Terraço',
  startDatetime: '2026-09-20 18:00:00',
  endDatetime: '2026-09-20 22:00:00',
  reason: 'evento particular',
});
assert.ok(answer.includes('Terraço'));
assert.ok(answer.includes('evento particular'));
assert.ok(answer.includes('20/09'));

assert.equal(normalizeAreaName('Terraço'), 'terraco');

console.log('✅ agendaBlockHelpers: bounds, FAQ topic e aliases ok');
