'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { targetsRestaurantReservations } = require('../../tenancy/scopedQuery');

test('targetsRestaurantReservations detecta tabela alvo', () => {
  assert.equal(
    targetsRestaurantReservations('SELECT * FROM restaurant_reservations WHERE id = $1'),
    true,
  );
  assert.equal(targetsRestaurantReservations('SELECT * FROM users'), false);
});
