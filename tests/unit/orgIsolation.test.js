'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canAccessOperationalEstablishment,
  sqlEstablishmentInScope,
  sqlBarIdsInScope,
  resolveAccessibleBarIds,
  canAccessBarId,
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

test('sqlBarIdsInScope: null (superadmin) sem filtro', () => {
  const r = sqlBarIdsInScope(null, 'barid', 1);
  assert.equal(r.sql, '');
});

test('sqlBarIdsInScope: lista vazia => AND FALSE', () => {
  const r = sqlBarIdsInScope([], 'barid', 2);
  assert.equal(r.sql, ' AND FALSE');
});

test('resolveAccessibleBarIds: superadmin => null', async () => {
  const ids = await resolveAccessibleBarIds(
    { query: async () => ({ rows: [] }) },
    { isSuperAdmin: true, organizationIds: [], establishmentIds: [] },
  );
  assert.equal(ids, null);
});

test('resolveAccessibleBarIds: org mapeia legacy_bar_id', async () => {
  const pool = {
    async query(sql, params) {
      if (/organization_id = ANY/i.test(sql)) {
        assert.deepEqual(params[0], [2]);
        return { rows: [{ legacy_bar_id: 15, legacy_place_id: 10 }] };
      }
      if (/legacy_place_id = ANY/i.test(sql)) {
        return { rows: [{ legacy_bar_id: 15 }] };
      }
      return { rows: [] };
    },
  };
  const ids = await resolveAccessibleBarIds(pool, {
    isSuperAdmin: false,
    organizationIds: [2],
    establishmentIds: [10],
  });
  assert.ok(ids.includes(15));
  assert.ok(ids.includes(10));
});

test('canAccessBarId: place 10 libera bar 15 via establishments', async () => {
  const pool = {
    async query(sql) {
      if (/organization_id = ANY/i.test(sql)) {
        return { rows: [{ legacy_bar_id: 15, legacy_place_id: 10 }] };
      }
      if (/legacy_place_id = ANY/i.test(sql)) {
        return { rows: [{ legacy_bar_id: 15 }] };
      }
      return { rows: [] };
    },
  };
  const actor = {
    isSuperAdmin: false,
    organizationIds: [2],
    establishmentIds: [10],
  };
  assert.equal(await canAccessBarId(pool, actor, 15), true);
  assert.equal(await canAccessBarId(pool, actor, 99), false);
});
