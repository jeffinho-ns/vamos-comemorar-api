'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessEstablishment } = require('../../tenancy/tenantScope');

test('conta da casa com UEP do Justino acessa establishment 1', () => {
  const scope = {
    isAdmin: false,
    organizationIds: [1],
    establishmentIds: [1],
  };
  assert.equal(canAccessEstablishment(scope, 1), true);
  assert.equal(canAccessEstablishment(scope, 8), false);
});

test('conta da Pracinha com UEP 8 acessa establishment 8', () => {
  const scope = {
    isAdmin: false,
    organizationIds: [1],
    establishmentIds: [8],
  };
  assert.equal(canAccessEstablishment(scope, 8), true);
  assert.equal(canAccessEstablishment(scope, 1), false);
});

test('super admin no scope acessa qualquer casa', () => {
  assert.equal(canAccessEstablishment({ isAdmin: true, establishmentIds: [] }, 1), true);
  assert.equal(canAccessEstablishment({ isAdmin: true, establishmentIds: [] }, 8), true);
});
