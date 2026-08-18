'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canAccessOperationalEstablishment,
  sqlEstablishmentInScope,
} = require('../../tenancy/orgIsolation');

test('superadmin acessa qualquer establishment', () => {
  const actor = { isSuperAdmin: true, establishmentIds: [] };
  assert.equal(canAccessOperationalEstablishment(actor, 99), true);
});

test('escopado só acessa ids do escopo', () => {
  const actor = { isSuperAdmin: false, establishmentIds: [1, 7] };
  assert.equal(canAccessOperationalEstablishment(actor, 7), true);
  assert.equal(canAccessOperationalEstablishment(actor, 10), false);
});

test('sqlEstablishmentInScope: superadmin sem filtro', () => {
  const r = sqlEstablishmentInScope({ isSuperAdmin: true, establishmentIds: [] }, 'e.id', 1);
  assert.equal(r.sql, '');
  assert.deepEqual(r.params, []);
});

test('sqlEstablishmentInScope: sem ids => AND FALSE', () => {
  const r = sqlEstablishmentInScope({ isSuperAdmin: false, establishmentIds: [] }, 'e.id', 2);
  assert.equal(r.sql, ' AND FALSE');
});

test('sqlEstablishmentInScope: com ids => ANY', () => {
  const r = sqlEstablishmentInScope(
    { isSuperAdmin: false, establishmentIds: [1, 4] },
    'e.id',
    3,
  );
  assert.equal(r.sql, ' AND e.id = ANY($3::int[])');
  assert.deepEqual(r.params, [[1, 4]]);
  assert.equal(r.nextIndex, 4);
});
