'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bonusForDay, individualBonus } = require('../../services/justino360/saturdayMeta');

test('abaixo de 60 mil não paga bônus', () => {
  const result = bonusForDay({
    revenue: 53714.66,
    sales: [{ id: 1, waiter_name: 'Luana', waiter_code: 'grbsjm7', amount: 9000 }],
  });
  assert.equal(result.tier, null);
  assert.equal(result.cost.full_total, 0);
});

test('meta individual soma 50 a cada 2,5 mil acima de 8 mil', () => {
  assert.equal(individualBonus(7999), 0);
  assert.equal(individualBonus(8000), 50);
  assert.equal(individualBonus(12099.6), 100);
});

test('sábado de 96 mil cai no degrau de 94 mil', () => {
  const sales = [
    { id: 1, waiter_name: 'Rebeca', amount: 12099.6 },
    { id: 2, waiter_name: 'Vitoria', amount: 7480.8 },
    { id: 3, waiter_name: 'Emilia', amount: 7292.8 },
    { id: 4, waiter_name: 'Micaely', amount: 7166.2 },
    { id: 5, waiter_name: 'Mayra', amount: 5745 },
  ];
  const result = bonusForDay({ revenue: 96536.81, sales });
  assert.equal(result.tier.key, '94');
  assert.equal(result.winners[0].bonus_ranking, 50);
  assert.equal(result.winners[0].bonus_individual, 100);
  assert.equal(result.leadership.gerente, 150);
  assert.equal(result.raffle.per_sector, 4);
});
