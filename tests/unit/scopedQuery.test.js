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
  assert.equal(targetsRlsScopedTable('SELECT * FROM guests'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM reservas'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM promoters'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM promoter_eventos'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM menu_items'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM whatsapp_conversations'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM eventos'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM users'), true);
  assert.equal(targetsRlsScopedTable('SELECT * FROM unknown_table'), false);
});
