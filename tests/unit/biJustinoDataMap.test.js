'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { listDataMap } = require('../../services/biJustino/dataMap');

test('o mapa cobre reservas e check-in no nosso banco e não vaza segredo', () => {
  const mapa = listDataMap();
  const nossos = mapa.filter((item) => item.origem === 'nosso_banco').map((item) => item.action);
  assert.deepEqual(nossos.sort(), ['getDailyAttendance', 'getReservations']);
  for (const item of mapa) {
    assert.ok(item.action.startsWith('get'));
    assert.ok(item.label);
    assert.ok(['nosso_banco', 'aguarda_variaveis'].includes(item.origem));
    assert.equal(JSON.stringify(item).includes('password'), false);
  }
  const aguarda = mapa.filter((item) => item.origem === 'aguarda_variaveis');
  assert.ok(aguarda.length > 20);
  assert.ok(aguarda.some((item) => item.action === 'getRevenueOverview'));
  assert.ok(aguarda.some((item) => item.action === 'getDreBase'));
});
