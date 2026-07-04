'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { targetsRlsScopedTable } = require('../../tenancy/rlsTables');

test('targetsRlsScopedTable detecta tabelas RLS', () => {
  assert.equal(
    targetsRlsScopedTable('SELECT * FROM restaurant_reservations WHERE id = $1'),
    true,
  );
  assert.equal(targetsRlsScopedTable('SELECT * FROM guest_lists'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM users'), false);
});
