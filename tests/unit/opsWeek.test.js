'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { weekRange, buildWeekBoard } = require('../../services/rhIdeia/opsWeek');

test('semana começa na segunda', () => {
  const range = weekRange('2026-09-23');
  assert.equal(range.start, '2026-09-21');
  assert.equal(range.end, '2026-09-27');
  assert.equal(range.days.length, 7);
  assert.equal(range.days[0].label.startsWith('seg'), true);
});

test('quadro marca abertura e deixa fechamento vazio', () => {
  const days = weekRange('2026-09-21').days;
  const board = buildWeekBoard({
    days,
    sectors: [{ key: 'bar', name: 'Bar', sort_order: 1 }],
    runs: [
      {
        sector_key: 'bar',
        sector_name: 'Bar',
        run_date: '2026-09-21',
        shift_type: 'abertura',
        completed_at: '2026-09-21T20:42:00.000Z',
        by_name: 'Ana',
        nao_ok: 1,
        incidents: 0,
      },
    ],
  });
  assert.equal(board[0].days[0].abertura.by_name, 'Ana');
  assert.equal(board[0].days[0].abertura.nao_ok, 1);
  assert.equal(board[0].days[0].fechamento, null);
  assert.equal(board[0].days[1].abertura, null);
});
