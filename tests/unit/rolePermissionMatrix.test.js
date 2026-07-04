'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_PERMISSION_KEYS, FACTORY_ROLES } = require('../../billing/rolePermissionMatrix');

test('FACTORY_ROLES inclui 5 papéis de fábrica', () => {
  assert.equal(FACTORY_ROLES.length, 5);
  const keys = FACTORY_ROLES.map((r) => r.key);
  assert.ok(keys.includes('account_admin'));
  assert.ok(keys.includes('promoter'));
});

test('ROLE_PERMISSION_KEYS cobre todos os roles de fábrica', () => {
  for (const role of FACTORY_ROLES) {
    assert.ok(ROLE_PERMISSION_KEYS[role.key], `missing matrix for ${role.key}`);
  }
});

test('account_admin recebe wildcard', () => {
  assert.equal(ROLE_PERMISSION_KEYS.account_admin, '*');
});

test('recepcao não inclui delete de reservas', () => {
  const perms = ROLE_PERMISSION_KEYS.recepcao;
  assert.ok(!perms.includes('reservas:delete'));
  assert.ok(perms.includes('reservas:create'));
});
